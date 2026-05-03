import nacl from 'tweetnacl';
import {
  encryptData,
  decryptData,
  encryptToBase64,
  decryptFromBase64,
  type EncryptedPayload,
} from '../utils/bleEncryption';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a valid 32-byte shared key (same as ECDH output). */
function makeSharedKey(): Uint8Array {
  return nacl.randomBytes(32);
}

/** Build a Uint8Array of the given length filled with sequential bytes. */
function makeData(length: number): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = i % 256;
  }
  return data;
}

// ---------------------------------------------------------------------------
// encryptData / decryptData
// ---------------------------------------------------------------------------

describe('encryptData / decryptData', () => {
  it('round-trips — decrypted data matches the original plaintext', () => {
    const key = makeSharedKey();
    const plaintext = new TextEncoder().encode('hello world');

    const payload = encryptData(plaintext, key);
    const decrypted = decryptData(payload, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('produces ciphertext that differs from the plaintext', () => {
    const key = makeSharedKey();
    const plaintext = new TextEncoder().encode('secret message');

    const { ciphertext } = encryptData(plaintext, key);

    // Ciphertext includes a 16-byte Poly1305 tag, so it is longer.
    expect(ciphertext.length).toBeGreaterThan(plaintext.length);
    // The raw bytes should not match.
    expect(ciphertext.slice(0, plaintext.length)).not.toEqual(plaintext);
  });

  it('uses a 24-byte nonce (NaCl secretbox nonce size)', () => {
    const key = makeSharedKey();
    const plaintext = new TextEncoder().encode('test');

    const { nonce } = encryptData(plaintext, key);

    expect(nonce).toBeInstanceOf(Uint8Array);
    expect(nonce.length).toBe(24);
  });

  it('produces different ciphertext on successive calls (random nonce)', () => {
    const key = makeSharedKey();
    const plaintext = new TextEncoder().encode('same input');

    const a = encryptData(plaintext, key);
    const b = encryptData(plaintext, key);

    // Nonces should differ.
    expect(a.nonce).not.toEqual(b.nonce);
    // Ciphertext should differ because the nonce differs.
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('returns null when decrypting with the wrong key', () => {
    const key1 = makeSharedKey();
    const key2 = makeSharedKey();
    const plaintext = new TextEncoder().encode('private');

    const payload = encryptData(plaintext, key1);
    const result = decryptData(payload, key2);

    expect(result).toBeNull();
  });

  it('returns null when ciphertext has been tampered with', () => {
    const key = makeSharedKey();
    const plaintext = new TextEncoder().encode('integrity check');

    const payload = encryptData(plaintext, key);

    // Flip a byte in the ciphertext.
    const tampered = new Uint8Array(payload.ciphertext);
    tampered[0] ^= 0xff;

    const result = decryptData({ ciphertext: tampered, nonce: payload.nonce }, key);

    expect(result).toBeNull();
  });

  it('handles empty plaintext', () => {
    const key = makeSharedKey();
    const plaintext = new Uint8Array(0);

    const payload = encryptData(plaintext, key);
    const decrypted = decryptData(payload, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('handles large data (simulating an image payload)', () => {
    const key = makeSharedKey();
    // 64 KB — representative of a compressed image chunk.
    const plaintext = makeData(65536);

    const payload = encryptData(plaintext, key);
    const decrypted = decryptData(payload, key);

    expect(decrypted).toEqual(plaintext);
  });
});

// ---------------------------------------------------------------------------
// encryptToBase64 / decryptFromBase64
// ---------------------------------------------------------------------------

describe('encryptToBase64 / decryptFromBase64', () => {
  it('round-trips through base64 encoding', () => {
    const key = makeSharedKey();
    const plaintext = new TextEncoder().encode('base64 round trip');

    const encoded = encryptToBase64(plaintext, key);
    const decrypted = decryptFromBase64(encoded, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('returns a valid base64 string', () => {
    const key = makeSharedKey();
    const plaintext = new TextEncoder().encode('check format');

    const encoded = encryptToBase64(plaintext, key);

    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('returns null when decrypting with the wrong key', () => {
    const key1 = makeSharedKey();
    const key2 = makeSharedKey();
    const plaintext = new TextEncoder().encode('wrong key test');

    const encoded = encryptToBase64(plaintext, key1);
    const result = decryptFromBase64(encoded, key2);

    expect(result).toBeNull();
  });

  it('returns null for a truncated base64 string (too short for nonce)', () => {
    const key = makeSharedKey();
    // A base64 string that decodes to fewer than 24 bytes.
    const shortBase64 = btoa('short');

    const result = decryptFromBase64(shortBase64, key);

    expect(result).toBeNull();
  });

  it('handles empty plaintext via base64', () => {
    const key = makeSharedKey();
    const plaintext = new Uint8Array(0);

    const encoded = encryptToBase64(plaintext, key);
    const decrypted = decryptFromBase64(encoded, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('handles small plaintext (1 byte)', () => {
    const key = makeSharedKey();
    const plaintext = new Uint8Array([42]);

    const encoded = encryptToBase64(plaintext, key);
    const decrypted = decryptFromBase64(encoded, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('handles large data via base64', () => {
    const key = makeSharedKey();
    const plaintext = makeData(32768);

    const encoded = encryptToBase64(plaintext, key);
    const decrypted = decryptFromBase64(encoded, key);

    expect(decrypted).toEqual(plaintext);
  });
});
