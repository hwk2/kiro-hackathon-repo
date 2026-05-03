/**
 * BLE pairing persistence layer.
 *
 * Stores and retrieves pairing information using AsyncStorage so that
 * the mobile app can reconnect to a previously paired desktop without
 * requiring the user to go through the pairing flow again.
 *
 * Keys are base64-encoded for safe JSON serialization. Use the helpers
 * from bleKeyExchange.ts to convert between Uint8Array and base64.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { publicKeyToBase64 } from './bleKeyExchange';
import type { DiscoveredDevice } from './bleScanner';
import type { PairingKeys } from './bleKeyExchange';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AsyncStorage key for persisted pairing information. */
export const PAIRING_INFO_KEY = 'ble_pairing_info';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the pairing data persisted in AsyncStorage. */
export interface StoredPairingInfo {
  /** BLE device ID of the paired desktop. */
  deviceId: string;
  /** Human-readable device name. */
  deviceName: string;
  /** Our secret key (base64-encoded) for re-deriving the shared key. */
  ownSecretKeyBase64: string;
  /** Our public key (base64-encoded). */
  ownPublicKeyBase64: string;
  /** Peer's public key (base64-encoded). */
  peerPublicKeyBase64: string;
  /** The derived shared key (base64-encoded) for AES-256-GCM. */
  sharedKeyBase64: string;
  /** ISO timestamp of when pairing was established. */
  pairedAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist pairing information to AsyncStorage.
 *
 * @param device      The discovered BLE device that was paired.
 * @param pairingKeys The completed pairing session keys.
 * @throws If `pairingKeys.sharedKey` or `pairingKeys.peerPublicKey` is null.
 */
export async function savePairingInfo(
  device: DiscoveredDevice,
  pairingKeys: PairingKeys,
): Promise<void> {
  if (!pairingKeys.sharedKey) {
    throw new Error('Cannot save pairing info: sharedKey is null. Complete the pairing session first.');
  }
  if (!pairingKeys.peerPublicKey) {
    throw new Error('Cannot save pairing info: peerPublicKey is null. Complete the pairing session first.');
  }

  const info: StoredPairingInfo = {
    deviceId: device.id,
    deviceName: device.name,
    ownSecretKeyBase64: publicKeyToBase64(pairingKeys.keyPair.secretKey),
    ownPublicKeyBase64: publicKeyToBase64(pairingKeys.keyPair.publicKey),
    peerPublicKeyBase64: publicKeyToBase64(pairingKeys.peerPublicKey),
    sharedKeyBase64: publicKeyToBase64(pairingKeys.sharedKey),
    pairedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(PAIRING_INFO_KEY, JSON.stringify(info));
}

/**
 * Load persisted pairing information from AsyncStorage.
 *
 * @returns The stored pairing info, or null if none exists or the data is invalid.
 */
export async function loadPairingInfo(): Promise<StoredPairingInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(PAIRING_INFO_KEY);
    if (raw === null) return null;

    const parsed = JSON.parse(raw) as StoredPairingInfo;

    // Basic shape validation — all required fields must be present strings.
    if (
      typeof parsed.deviceId !== 'string' ||
      typeof parsed.deviceName !== 'string' ||
      typeof parsed.ownSecretKeyBase64 !== 'string' ||
      typeof parsed.ownPublicKeyBase64 !== 'string' ||
      typeof parsed.peerPublicKeyBase64 !== 'string' ||
      typeof parsed.sharedKeyBase64 !== 'string' ||
      typeof parsed.pairedAt !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch {
    // JSON parse failure or AsyncStorage error — treat as no data.
    return null;
  }
}

/**
 * Remove persisted pairing information from AsyncStorage.
 */
export async function clearPairingInfo(): Promise<void> {
  await AsyncStorage.removeItem(PAIRING_INFO_KEY);
}

/**
 * Check whether pairing information exists in AsyncStorage.
 */
export async function hasPairingInfo(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PAIRING_INFO_KEY);
  return raw !== null;
}
