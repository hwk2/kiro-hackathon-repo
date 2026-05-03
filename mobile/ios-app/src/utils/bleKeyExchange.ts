/**
 * ECDH key exchange utilities for BLE pairing.
 *
 * Uses tweetnacl's X25519 Diffie-Hellman to derive a shared 32-byte secret
 * between the mobile app and the desktop visualization engine. This shared
 * secret is used as the AES-256-GCM encryption key for all image transfers.
 *
 * Flow during pairing:
 * 1. Mobile calls createPairingSession() to generate a fresh X25519 key pair.
 * 2. Mobile sends its public key (base64-encoded) to the desktop via BLE.
 * 3. Desktop sends its public key back.
 * 4. Mobile calls completePairingSession() with the desktop's public key.
 * 5. Both sides now share the same 32-byte secret for AES-256-GCM.
 */

import nacl from 'tweetnacl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An X25519 key pair (32-byte public key + 32-byte secret key). */
export interface KeyPairResult {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** State of an in-progress or completed pairing session. */
export interface PairingKeys {
  /** The local X25519 key pair generated for this session. */
  keyPair: KeyPairResult;
  /** The 32-byte shared secret derived via ECDH, or null before completion. */
  sharedKey: Uint8Array | null;
  /** The peer's public key received over BLE, or null before completion. */
  peerPublicKey: Uint8Array | null;
}

// ---------------------------------------------------------------------------
// Key generation and derivation
// ---------------------------------------------------------------------------

/**
 * Generate a fresh X25519 key pair using tweetnacl.
 *
 * @returns A KeyPairResult with 32-byte publicKey and 32-byte secretKey.
 */
export function generateKeyPair(): KeyPairResult {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/**
 * Derive a 32-byte shared secret from our secret key and the peer's public key
 * using X25519 Diffie-Hellman (nacl.box.before).
 *
 * The resulting shared secret is suitable for use as an AES-256-GCM key.
 *
 * @param ownSecretKey  Our 32-byte X25519 secret key.
 * @param peerPublicKey The peer's 32-byte X25519 public key.
 * @returns A 32-byte Uint8Array shared secret.
 */
export function deriveSharedKey(
  ownSecretKey: Uint8Array,
  peerPublicKey: Uint8Array,
): Uint8Array {
  return nacl.box.before(peerPublicKey, ownSecretKey);
}

// ---------------------------------------------------------------------------
// Pairing session helpers
// ---------------------------------------------------------------------------

/**
 * Create a new pairing session with a fresh key pair.
 *
 * The sharedKey and peerPublicKey are null until completePairingSession()
 * is called with the peer's public key.
 */
export function createPairingSession(): PairingKeys {
  return {
    keyPair: generateKeyPair(),
    sharedKey: null,
    peerPublicKey: null,
  };
}

/**
 * Complete a pairing session by deriving the shared key from the peer's
 * public key.
 *
 * @param session       The pairing session created by createPairingSession().
 * @param peerPublicKey The peer's 32-byte X25519 public key.
 * @returns A new PairingKeys with sharedKey and peerPublicKey populated.
 */
export function completePairingSession(
  session: PairingKeys,
  peerPublicKey: Uint8Array,
): PairingKeys {
  const sharedKey = deriveSharedKey(session.keyPair.secretKey, peerPublicKey);
  return {
    keyPair: session.keyPair,
    sharedKey,
    peerPublicKey,
  };
}

// ---------------------------------------------------------------------------
// Base64 encoding helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Uint8Array public key to a base64 string for transmission over BLE.
 */
export function publicKeyToBase64(key: Uint8Array): string {
  // Build a binary string from the byte array, then base64-encode it.
  let binary = '';
  for (let i = 0; i < key.length; i++) {
    binary += String.fromCharCode(key[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64-encoded public key string back to a Uint8Array.
 */
export function base64ToPublicKey(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
