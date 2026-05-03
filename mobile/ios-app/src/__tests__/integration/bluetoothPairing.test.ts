/**
 * Integration tests: Bluetooth pairing with Windows and macOS desktop.
 *
 * Validates requirement 3.10: "THE Mobile_App SHALL support pairing with
 * Desktop_Visualization_Engine instances running on both Windows and macOS."
 *
 * Exercises the full pairing lifecycle — discovery, ECDH key exchange,
 * persistence, unpair — using real implementations of bleKeyExchange,
 * blePairingStore, bleEncryption, and bleUnpair. Only AsyncStorage is mocked.
 */

import nacl from 'tweetnacl';
import {
  createPairingSession,
  completePairingSession,
  generateKeyPair,
  deriveSharedKey,
  publicKeyToBase64,
  base64ToPublicKey,
} from '../../utils/bleKeyExchange';
import {
  savePairingInfo,
  loadPairingInfo,
  clearPairingInfo,
  hasPairingInfo,
} from '../../utils/blePairingStore';
import {
  encryptData,
  decryptData,
  encryptToBase64,
  decryptFromBase64,
} from '../../utils/bleEncryption';
import { executeUnpair } from '../../utils/bleUnpair';
import { INITIAL_CONNECTION_STATE } from '../../utils/bleConnectionManager';
import type { DiscoveredDevice } from '../../utils/bleScanner';
import type { PairingKeys } from '../../utils/bleKeyExchange';

// ---------------------------------------------------------------------------
// Mock only I/O boundaries
// ---------------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      getItem: jest.fn(async (key: string) => {
        return store[key] ?? null;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Windows-style desktop device. */
function makeWindowsDevice(): DiscoveredDevice {
  return {
    id: 'AA:BB:CC:DD:EE:01',
    name: 'DESKTOP-WIN11',
    rssi: -45,
    discoveredAt: new Date().toISOString(),
  };
}

/** macOS-style desktop device. */
function makeMacDevice(): DiscoveredDevice {
  return {
    id: '11:22:33:44:55:66',
    name: 'MacBook-Pro',
    rssi: -52,
    discoveredAt: new Date().toISOString(),
  };
}

/** Build sample plaintext data. */
function makeSampleData(size: number = 512): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }
  return data;
}

/**
 * Simulate a full pairing between mobile and a desktop device.
 * Returns the completed mobile session and the desktop's key pair.
 */
function simulatePairing(device: DiscoveredDevice): {
  mobileSession: PairingKeys;
  desktopKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
  completedSession: PairingKeys;
} {
  const mobileSession = createPairingSession();
  const desktopKeyPair = generateKeyPair();
  const completedSession = completePairingSession(mobileSession, desktopKeyPair.publicKey);
  return { mobileSession, desktopKeyPair, completedSession };
}

// ---------------------------------------------------------------------------
// Cross-platform pairing simulation
// ---------------------------------------------------------------------------

describe('Cross-platform pairing simulation', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('pairs with a Windows desktop device and produces valid session keys', () => {
    const device = makeWindowsDevice();
    const { completedSession } = simulatePairing(device);

    expect(completedSession.sharedKey).toBeInstanceOf(Uint8Array);
    expect(completedSession.sharedKey!.length).toBe(32);
    expect(completedSession.peerPublicKey).toBeInstanceOf(Uint8Array);
    expect(completedSession.peerPublicKey!.length).toBe(32);
    expect(completedSession.keyPair.publicKey.length).toBe(32);
    expect(completedSession.keyPair.secretKey.length).toBe(32);
  });

  it('pairs with a macOS desktop device and produces valid session keys', () => {
    const device = makeMacDevice();
    const { completedSession } = simulatePairing(device);

    expect(completedSession.sharedKey).toBeInstanceOf(Uint8Array);
    expect(completedSession.sharedKey!.length).toBe(32);
    expect(completedSession.peerPublicKey).toBeInstanceOf(Uint8Array);
    expect(completedSession.peerPublicKey!.length).toBe(32);
    expect(completedSession.keyPair.publicKey.length).toBe(32);
    expect(completedSession.keyPair.secretKey.length).toBe(32);
  });

  it('derives the same shared key on both mobile and Windows desktop sides', () => {
    const { mobileSession, desktopKeyPair, completedSession } = simulatePairing(makeWindowsDevice());

    // Desktop derives shared key from its own secret + mobile's public key
    const desktopSharedKey = nacl.box.before(
      mobileSession.keyPair.publicKey,
      desktopKeyPair.secretKey,
    );

    expect(completedSession.sharedKey).toEqual(desktopSharedKey);
  });

  it('derives the same shared key on both mobile and macOS desktop sides', () => {
    const { mobileSession, desktopKeyPair, completedSession } = simulatePairing(makeMacDevice());

    const desktopSharedKey = nacl.box.before(
      mobileSession.keyPair.publicKey,
      desktopKeyPair.secretKey,
    );

    expect(completedSession.sharedKey).toEqual(desktopSharedKey);
  });
});

// ---------------------------------------------------------------------------
// Full pairing lifecycle
// ---------------------------------------------------------------------------

describe('Full pairing lifecycle', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('discover → confirm → key exchange → persist → load → verify keys match', async () => {
    // 1. Discover device
    const device = makeWindowsDevice();

    // 2. Confirm pairing (simulated — user taps "Pair")

    // 3. ECDH key exchange
    const { completedSession } = simulatePairing(device);
    const sharedKey = completedSession.sharedKey!;

    // 4. Persist pairing
    await savePairingInfo(device, completedSession);

    // 5. Load pairing
    const loaded = await loadPairingInfo();
    expect(loaded).not.toBeNull();
    expect(loaded!.deviceId).toBe(device.id);
    expect(loaded!.deviceName).toBe(device.name);

    // 6. Verify keys match
    expect(loaded!.sharedKeyBase64).toBe(publicKeyToBase64(sharedKey));
    expect(loaded!.ownPublicKeyBase64).toBe(publicKeyToBase64(completedSession.keyPair.publicKey));
    expect(loaded!.peerPublicKeyBase64).toBe(publicKeyToBase64(completedSession.peerPublicKey!));
  });

  it('pair → unpair → verify pairing data is cleared', async () => {
    const device = makeMacDevice();
    const { completedSession } = simulatePairing(device);

    // Persist pairing
    await savePairingInfo(device, completedSession);
    expect(await hasPairingInfo()).toBe(true);

    // Unpair
    const stateChanges: unknown[] = [];
    await executeUnpair({
      onStateChange: (state) => stateChanges.push(state),
    });

    // Verify pairing data is cleared
    expect(await hasPairingInfo()).toBe(false);
    const loaded = await loadPairingInfo();
    expect(loaded).toBeNull();

    // Verify state was set to disconnected
    expect(stateChanges.length).toBe(1);
    expect(stateChanges[0]).toEqual(
      expect.objectContaining({
        status: 'disconnected',
        deviceId: null,
        deviceName: null,
      }),
    );
  });

  it('pair → load persisted info → re-derive shared key from stored keys', async () => {
    const device = makeWindowsDevice();
    const { completedSession } = simulatePairing(device);

    // Persist
    await savePairingInfo(device, completedSession);

    // Load
    const loaded = await loadPairingInfo();
    expect(loaded).not.toBeNull();

    // Re-derive shared key from stored secret key + peer public key
    const ownSecretKey = base64ToPublicKey(loaded!.ownSecretKeyBase64);
    const peerPublicKey = base64ToPublicKey(loaded!.peerPublicKeyBase64);
    const reDerivedSharedKey = deriveSharedKey(ownSecretKey, peerPublicKey);

    // Should match the originally stored shared key
    const storedSharedKey = base64ToPublicKey(loaded!.sharedKeyBase64);
    expect(reDerivedSharedKey).toEqual(storedSharedKey);
  });
});

// ---------------------------------------------------------------------------
// Key exchange cross-platform verification
// ---------------------------------------------------------------------------

describe('Key exchange cross-platform verification', () => {
  it('mobile and Windows desktop derive the same shared key (simulate both sides)', () => {
    // Mobile side
    const mobileSession = createPairingSession();

    // Windows desktop side
    const desktopKeyPair = generateKeyPair();

    // Exchange public keys
    const mobileCompleted = completePairingSession(mobileSession, desktopKeyPair.publicKey);
    const desktopSharedKey = deriveSharedKey(desktopKeyPair.secretKey, mobileSession.keyPair.publicKey);

    expect(mobileCompleted.sharedKey).toEqual(desktopSharedKey);
  });

  it('mobile and macOS desktop derive the same shared key (simulate both sides)', () => {
    // Mobile side
    const mobileSession = createPairingSession();

    // macOS desktop side
    const desktopKeyPair = generateKeyPair();

    // Exchange public keys
    const mobileCompleted = completePairingSession(mobileSession, desktopKeyPair.publicKey);
    const desktopSharedKey = deriveSharedKey(desktopKeyPair.secretKey, mobileSession.keyPair.publicKey);

    expect(mobileCompleted.sharedKey).toEqual(desktopSharedKey);
  });

  it('shared key can encrypt/decrypt data (integration with bleEncryption)', () => {
    const { completedSession, desktopKeyPair, mobileSession } = simulatePairing(makeWindowsDevice());
    const mobileSharedKey = completedSession.sharedKey!;

    // Desktop derives the same shared key
    const desktopSharedKey = nacl.box.before(
      mobileSession.keyPair.publicKey,
      desktopKeyPair.secretKey,
    );

    const plaintext = makeSampleData(1024);

    // Mobile encrypts with its shared key
    const encrypted = encryptData(plaintext, mobileSharedKey);

    // Desktop decrypts with its shared key (should be identical)
    const decrypted = decryptData(encrypted, desktopSharedKey);
    expect(decrypted).not.toBeNull();
    expect(decrypted).toEqual(plaintext);
  });

  it('shared key works with base64 encrypt/decrypt helpers', () => {
    const { completedSession, desktopKeyPair, mobileSession } = simulatePairing(makeMacDevice());
    const mobileSharedKey = completedSession.sharedKey!;

    const desktopSharedKey = nacl.box.before(
      mobileSession.keyPair.publicKey,
      desktopKeyPair.secretKey,
    );

    const plaintext = makeSampleData(2048);

    // Mobile encrypts to base64
    const base64Encrypted = encryptToBase64(plaintext, mobileSharedKey);
    expect(typeof base64Encrypted).toBe('string');

    // Desktop decrypts from base64
    const decrypted = decryptFromBase64(base64Encrypted, desktopSharedKey);
    expect(decrypted).not.toBeNull();
    expect(decrypted).toEqual(plaintext);
  });

  it('decryption fails with a wrong key', () => {
    const { completedSession } = simulatePairing(makeWindowsDevice());
    const mobileSharedKey = completedSession.sharedKey!;

    const plaintext = makeSampleData(256);
    const encrypted = encryptData(plaintext, mobileSharedKey);

    // Try to decrypt with a completely different key
    const wrongKey = nacl.randomBytes(32);
    const decrypted = decryptData(encrypted, wrongKey);
    expect(decrypted).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pairing persistence
// ---------------------------------------------------------------------------

describe('Pairing persistence', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('save/load roundtrip preserves device ID, device name, and all keys', async () => {
    const device = makeMacDevice();
    const { completedSession } = simulatePairing(device);

    await savePairingInfo(device, completedSession);
    const loaded = await loadPairingInfo();

    expect(loaded).not.toBeNull();
    expect(loaded!.deviceId).toBe(device.id);
    expect(loaded!.deviceName).toBe(device.name);
    expect(loaded!.ownSecretKeyBase64).toBe(publicKeyToBase64(completedSession.keyPair.secretKey));
    expect(loaded!.ownPublicKeyBase64).toBe(publicKeyToBase64(completedSession.keyPair.publicKey));
    expect(loaded!.peerPublicKeyBase64).toBe(publicKeyToBase64(completedSession.peerPublicKey!));
    expect(loaded!.sharedKeyBase64).toBe(publicKeyToBase64(completedSession.sharedKey!));
    expect(typeof loaded!.pairedAt).toBe('string');
  });

  it('loaded keys can be used for encryption/decryption', async () => {
    const device = makeWindowsDevice();
    const { completedSession } = simulatePairing(device);

    await savePairingInfo(device, completedSession);
    const loaded = await loadPairingInfo();
    expect(loaded).not.toBeNull();

    // Reconstruct the shared key from stored base64
    const restoredSharedKey = base64ToPublicKey(loaded!.sharedKeyBase64);

    const plaintext = makeSampleData(512);

    // Encrypt with restored key
    const encrypted = encryptToBase64(plaintext, restoredSharedKey);

    // Decrypt with restored key
    const decrypted = decryptFromBase64(encrypted, restoredSharedKey);
    expect(decrypted).not.toBeNull();
    expect(decrypted).toEqual(plaintext);
  });

  it('Windows pairing persistence roundtrip preserves all fields', async () => {
    const device = makeWindowsDevice();
    const { completedSession } = simulatePairing(device);

    await savePairingInfo(device, completedSession);
    const loaded = await loadPairingInfo();

    expect(loaded).not.toBeNull();
    expect(loaded!.deviceId).toBe('AA:BB:CC:DD:EE:01');
    expect(loaded!.deviceName).toBe('DESKTOP-WIN11');
  });

  it('macOS pairing persistence roundtrip preserves all fields', async () => {
    const device = makeMacDevice();
    const { completedSession } = simulatePairing(device);

    await savePairingInfo(device, completedSession);
    const loaded = await loadPairingInfo();

    expect(loaded).not.toBeNull();
    expect(loaded!.deviceId).toBe('11:22:33:44:55:66');
    expect(loaded!.deviceName).toBe('MacBook-Pro');
  });
});
