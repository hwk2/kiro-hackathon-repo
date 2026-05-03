/**
 * Authenticated encryption utilities for BLE image transfer.
 *
 * Uses tweetnacl's secretbox (XSalsa20-Poly1305) to encrypt and decrypt
 * data with the 32-byte shared key derived during ECDH key exchange.
 * This provides authenticated encryption — tampered ciphertext is detected
 * and decryption returns null.
 *
 * The base64 helpers pack the nonce and ciphertext into a single string
 * for easy inclusion in JSON protocol messages (e.g. the `data_base64`
 * field of `image_transfer` payloads).
 *
 * Usage:
 *   import { encryptToBase64, decryptFromBase64 } from './bleEncryption';
 *
 *   const encrypted = encryptToBase64(imageBytes, sharedKey);
 *   const decrypted = decryptFromBase64(encrypted, sharedKey);
 */

import nacl from 'tweetnacl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Encrypted payload with nonce for decryption. */
export interface EncryptedPayload {
  /** The encrypted data. */
  ciphertext: Uint8Array;
  /** The nonce used for encryption (24 bytes for NaCl secretbox). */
  nonce: Uint8Array;
}

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt data using the shared key from ECDH key exchange.
 * Uses NaCl secretbox (XSalsa20-Poly1305 authenticated encryption).
 *
 * @param plaintext The data to encrypt.
 * @param sharedKey The 32-byte shared key from ECDH.
 * @returns EncryptedPayload with ciphertext and nonce.
 */
export function encryptData(
  plaintext: Uint8Array,
  sharedKey: Uint8Array,
): EncryptedPayload {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(plaintext, nonce, sharedKey);
  return { ciphertext, nonce };
}

/**
 * Decrypt data using the shared key.
 *
 * @param payload The encrypted payload (ciphertext + nonce).
 * @param sharedKey The 32-byte shared key from ECDH.
 * @returns The decrypted data, or null if decryption fails (tampered data).
 */
export function decryptData(
  payload: EncryptedPayload,
  sharedKey: Uint8Array,
): Uint8Array | null {
  return nacl.secretbox.open(payload.ciphertext, payload.nonce, sharedKey);
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

/**
 * Encrypt data and return as a base64-encoded string (for JSON serialization).
 * The format is: base64(nonce + ciphertext)
 *
 * @param plaintext The data to encrypt.
 * @param sharedKey The 32-byte shared key from ECDH.
 * @returns A base64 string containing the nonce prepended to the ciphertext.
 */
export function encryptToBase64(
  plaintext: Uint8Array,
  sharedKey: Uint8Array,
): string {
  const { ciphertext, nonce } = encryptData(plaintext, sharedKey);

  // Concatenate nonce + ciphertext into a single buffer.
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return uint8ArrayToBase64(combined);
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Expects format: base64(nonce + ciphertext)
 *
 * @param base64Data The base64 string produced by encryptToBase64.
 * @param sharedKey  The 32-byte shared key from ECDH.
 * @returns The decrypted data, or null if decryption fails.
 */
export function decryptFromBase64(
  base64Data: string,
  sharedKey: Uint8Array,
): Uint8Array | null {
  const combined = base64ToUint8Array(base64Data);

  const nonceLength = nacl.secretbox.nonceLength;
  if (combined.length < nonceLength) {
    return null;
  }

  const nonce = combined.slice(0, nonceLength);
  const ciphertext = combined.slice(nonceLength);

  return decryptData({ ciphertext, nonce }, sharedKey);
}

// ---------------------------------------------------------------------------
// Internal base64 encoding helpers
// ---------------------------------------------------------------------------

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
