import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  savePairingInfo,
  loadPairingInfo,
  clearPairingInfo,
  hasPairingInfo,
  PAIRING_INFO_KEY,
  type StoredPairingInfo,
} from '../utils/blePairingStore';
import {
  createPairingSession,
  completePairingSession,
  generateKeyPair,
  publicKeyToBase64,
  type PairingKeys,
} from '../utils/bleKeyExchange';
import type { DiscoveredDevice } from '../utils/bleScanner';

// ---------------------------------------------------------------------------
// Mock AsyncStorage (uses the built-in Jest mock)
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake DiscoveredDevice for testing. */
function makeDevice(overrides?: Partial<DiscoveredDevice>): DiscoveredDevice {
  return {
    id: 'AA:BB:CC:DD:EE:FF',
    name: 'Desktop-Test',
    rssi: -55,
    discoveredAt: '2025-01-15T10:00:00.000Z',
    ...overrides,
  };
}

/** Create a completed PairingKeys for testing. */
function makeCompletedPairingKeys(): PairingKeys {
  const session = createPairingSession();
  const peer = generateKeyPair();
  return completePairingSession(session, peer.publicKey);
}

/** Create an incomplete PairingKeys (sharedKey and peerPublicKey are null). */
function makeIncompletePairingKeys(): PairingKeys {
  return createPairingSession();
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear!();
});

// ---------------------------------------------------------------------------
// savePairingInfo
// ---------------------------------------------------------------------------

describe('savePairingInfo', () => {
  it('stores correct JSON in AsyncStorage', async () => {
    const device = makeDevice();
    const keys = makeCompletedPairingKeys();

    await savePairingInfo(device, keys);

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    const [storedKey, storedValue] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(storedKey).toBe(PAIRING_INFO_KEY);

    const parsed: StoredPairingInfo = JSON.parse(storedValue);
    expect(parsed.deviceId).toBe(device.id);
    expect(parsed.deviceName).toBe(device.name);
    expect(parsed.ownSecretKeyBase64).toBe(publicKeyToBase64(keys.keyPair.secretKey));
    expect(parsed.ownPublicKeyBase64).toBe(publicKeyToBase64(keys.keyPair.publicKey));
    expect(parsed.peerPublicKeyBase64).toBe(publicKeyToBase64(keys.peerPublicKey!));
    expect(parsed.sharedKeyBase64).toBe(publicKeyToBase64(keys.sharedKey!));
    expect(typeof parsed.pairedAt).toBe('string');
    // pairedAt should be a valid ISO date
    expect(new Date(parsed.pairedAt).toISOString()).toBe(parsed.pairedAt);
  });

  it('throws when sharedKey is null', async () => {
    const device = makeDevice();
    const keys = makeIncompletePairingKeys();

    await expect(savePairingInfo(device, keys)).rejects.toThrow('sharedKey is null');
  });

  it('throws when peerPublicKey is null', async () => {
    const device = makeDevice();
    const session = createPairingSession();
    // Manually set sharedKey but leave peerPublicKey null
    const keys: PairingKeys = {
      ...session,
      sharedKey: new Uint8Array(32),
      peerPublicKey: null,
    };

    await expect(savePairingInfo(device, keys)).rejects.toThrow('peerPublicKey is null');
  });
});

// ---------------------------------------------------------------------------
// loadPairingInfo
// ---------------------------------------------------------------------------

describe('loadPairingInfo', () => {
  it('returns the stored data after saving', async () => {
    const device = makeDevice();
    const keys = makeCompletedPairingKeys();

    await savePairingInfo(device, keys);
    const loaded = await loadPairingInfo();

    expect(loaded).not.toBeNull();
    expect(loaded!.deviceId).toBe(device.id);
    expect(loaded!.deviceName).toBe(device.name);
    expect(loaded!.ownSecretKeyBase64).toBe(publicKeyToBase64(keys.keyPair.secretKey));
    expect(loaded!.ownPublicKeyBase64).toBe(publicKeyToBase64(keys.keyPair.publicKey));
    expect(loaded!.peerPublicKeyBase64).toBe(publicKeyToBase64(keys.peerPublicKey!));
    expect(loaded!.sharedKeyBase64).toBe(publicKeyToBase64(keys.sharedKey!));
  });

  it('returns null when no data exists', async () => {
    const loaded = await loadPairingInfo();
    expect(loaded).toBeNull();
  });

  it('returns null for corrupted JSON', async () => {
    await AsyncStorage.setItem(PAIRING_INFO_KEY, '{not valid json!!!');
    const loaded = await loadPairingInfo();
    expect(loaded).toBeNull();
  });

  it('returns null for valid JSON with missing fields', async () => {
    await AsyncStorage.setItem(PAIRING_INFO_KEY, JSON.stringify({ deviceId: 'abc' }));
    const loaded = await loadPairingInfo();
    expect(loaded).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearPairingInfo
// ---------------------------------------------------------------------------

describe('clearPairingInfo', () => {
  it('removes stored pairing data', async () => {
    const device = makeDevice();
    const keys = makeCompletedPairingKeys();

    await savePairingInfo(device, keys);
    expect(await loadPairingInfo()).not.toBeNull();

    await clearPairingInfo();
    expect(await loadPairingInfo()).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PAIRING_INFO_KEY);
  });
});

// ---------------------------------------------------------------------------
// hasPairingInfo
// ---------------------------------------------------------------------------

describe('hasPairingInfo', () => {
  it('returns false when no pairing info exists', async () => {
    expect(await hasPairingInfo()).toBe(false);
  });

  it('returns true after saving pairing info', async () => {
    const device = makeDevice();
    const keys = makeCompletedPairingKeys();

    await savePairingInfo(device, keys);
    expect(await hasPairingInfo()).toBe(true);
  });

  it('returns false after clearing pairing info', async () => {
    const device = makeDevice();
    const keys = makeCompletedPairingKeys();

    await savePairingInfo(device, keys);
    await clearPairingInfo();
    expect(await hasPairingInfo()).toBe(false);
  });
});
