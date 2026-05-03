import {
  generateKeyPair,
  deriveSharedKey,
  createPairingSession,
  completePairingSession,
  publicKeyToBase64,
  base64ToPublicKey,
  type KeyPairResult,
  type PairingKeys,
} from '../utils/bleKeyExchange';

// ---------------------------------------------------------------------------
// generateKeyPair
// ---------------------------------------------------------------------------

describe('generateKeyPair', () => {
  it('returns a 32-byte public key and a 32-byte secret key', () => {
    const kp = generateKeyPair();

    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(32);
  });

  it('generates different key pairs on successive calls', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();

    // Extremely unlikely to collide — treat as deterministic check.
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.secretKey).not.toEqual(kp2.secretKey);
  });
});

// ---------------------------------------------------------------------------
// deriveSharedKey
// ---------------------------------------------------------------------------

describe('deriveSharedKey', () => {
  it('returns a 32-byte shared secret', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const shared = deriveSharedKey(alice.secretKey, bob.publicKey);

    expect(shared).toBeInstanceOf(Uint8Array);
    expect(shared.length).toBe(32);
  });

  it('produces the same shared secret on both sides (ECDH symmetry)', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const sharedAlice = deriveSharedKey(alice.secretKey, bob.publicKey);
    const sharedBob = deriveSharedKey(bob.secretKey, alice.publicKey);

    expect(sharedAlice).toEqual(sharedBob);
  });

  it('is deterministic — same inputs always produce the same output', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const first = deriveSharedKey(alice.secretKey, bob.publicKey);
    const second = deriveSharedKey(alice.secretKey, bob.publicKey);

    expect(first).toEqual(second);
  });

  it('produces different shared secrets for different peer keys', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const charlie = generateKeyPair();

    const sharedWithBob = deriveSharedKey(alice.secretKey, bob.publicKey);
    const sharedWithCharlie = deriveSharedKey(alice.secretKey, charlie.publicKey);

    expect(sharedWithBob).not.toEqual(sharedWithCharlie);
  });
});

// ---------------------------------------------------------------------------
// Base64 encoding / decoding
// ---------------------------------------------------------------------------

describe('publicKeyToBase64 / base64ToPublicKey', () => {
  it('round-trips a public key through base64 encoding', () => {
    const kp = generateKeyPair();

    const encoded = publicKeyToBase64(kp.publicKey);
    const decoded = base64ToPublicKey(encoded);

    expect(decoded).toEqual(kp.publicKey);
  });

  it('returns a non-empty base64 string', () => {
    const kp = generateKeyPair();
    const encoded = publicKeyToBase64(kp.publicKey);

    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    // Base64 of 32 bytes = 44 characters (with padding)
    expect(encoded.length).toBe(44);
  });

  it('produces valid base64 characters only', () => {
    const kp = generateKeyPair();
    const encoded = publicKeyToBase64(kp.publicKey);

    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

// ---------------------------------------------------------------------------
// createPairingSession
// ---------------------------------------------------------------------------

describe('createPairingSession', () => {
  it('returns a PairingKeys with a valid key pair and null shared/peer keys', () => {
    const session = createPairingSession();

    expect(session.keyPair.publicKey).toBeInstanceOf(Uint8Array);
    expect(session.keyPair.secretKey).toBeInstanceOf(Uint8Array);
    expect(session.keyPair.publicKey.length).toBe(32);
    expect(session.keyPair.secretKey.length).toBe(32);
    expect(session.sharedKey).toBeNull();
    expect(session.peerPublicKey).toBeNull();
  });

  it('generates a unique key pair per session', () => {
    const s1 = createPairingSession();
    const s2 = createPairingSession();

    expect(s1.keyPair.publicKey).not.toEqual(s2.keyPair.publicKey);
  });
});

// ---------------------------------------------------------------------------
// completePairingSession
// ---------------------------------------------------------------------------

describe('completePairingSession', () => {
  it('derives a 32-byte shared key and stores the peer public key', () => {
    const session = createPairingSession();
    const peer = generateKeyPair();

    const completed = completePairingSession(session, peer.publicKey);

    expect(completed.sharedKey).toBeInstanceOf(Uint8Array);
    expect(completed.sharedKey!.length).toBe(32);
    expect(completed.peerPublicKey).toEqual(peer.publicKey);
  });

  it('preserves the original key pair', () => {
    const session = createPairingSession();
    const peer = generateKeyPair();

    const completed = completePairingSession(session, peer.publicKey);

    expect(completed.keyPair).toBe(session.keyPair);
  });

  it('derives the same shared key as the peer would', () => {
    const mobileSession = createPairingSession();
    const desktopSession = createPairingSession();

    const mobileCompleted = completePairingSession(
      mobileSession,
      desktopSession.keyPair.publicKey,
    );
    const desktopCompleted = completePairingSession(
      desktopSession,
      mobileSession.keyPair.publicKey,
    );

    expect(mobileCompleted.sharedKey).toEqual(desktopCompleted.sharedKey);
  });
});
