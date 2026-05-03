/**
 * End-to-end integration test: capture → validate → pair → transfer → verify checksum.
 *
 * Exercises the full pipeline from image validation through encrypted transfer
 * and checksum verification. Only I/O boundaries (AsyncStorage) are mocked —
 * all crypto, protocol, and validation modules use real implementations.
 */

import nacl from 'tweetnacl';
import type { CapturedImage } from '../../../App';
import { isValidResolution } from '../../utils/imageValidation';
import {
  createPairingSession,
  completePairingSession,
  generateKeyPair,
  publicKeyToBase64,
} from '../../utils/bleKeyExchange';
import { savePairingInfo, loadPairingInfo } from '../../utils/blePairingStore';
import { buildImageTransferMessage, computeChecksum } from '../../utils/bleImageTransfer';
import { decryptFromBase64 } from '../../utils/bleEncryption';
import { verifyAck, type AckResult } from '../../utils/bleAckHandler';
import {
  isValidEnvelope,
  PROTOCOL_VERSION,
  type ImageTransferPayload,
} from '../../utils/bleProtocol';
import { validateProtocolVersion } from '../../utils/bleVersionValidator';
import type { DiscoveredDevice } from '../../utils/bleScanner';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockImage(overrides?: Partial<CapturedImage>): CapturedImage {
  return {
    uri: 'file:///tmp/room_north.jpg',
    width: 1920,
    height: 1080,
    fileName: 'room_north.jpg',
    fileSize: 245760,
    capturedAt: '2025-01-15T10:30:00.000Z',
    ...overrides,
  };
}

function makeMockDevice(overrides?: Partial<DiscoveredDevice>): DiscoveredDevice {
  return {
    id: 'AA:BB:CC:DD:EE:FF',
    name: 'Desktop-Workstation',
    rssi: -50,
    discoveredAt: '2025-01-15T10:29:00.000Z',
    ...overrides,
  };
}

/** Build sample image data (sequential bytes). */
function makeSampleImageData(size: number = 1024): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Full pipeline test
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

describe('End-to-end: capture → validate → pair → transfer → verify checksum', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('walks through the entire flow from capture to ack verification', async () => {
    // ---------------------------------------------------------------
    // 1. Image validation — verify resolution passes
    // ---------------------------------------------------------------
    const image = makeMockImage({ width: 1920, height: 1080 });
    expect(isValidResolution(image.width, image.height)).toBe(true);

    const imageData = makeSampleImageData(2048);

    // ---------------------------------------------------------------
    // 2. BLE permissions — would return PoweredOn (mocked at I/O level)
    //    We skip the actual BleManager call since it requires native code.
    //    The permission module is tested in its own unit tests.
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // 3. BLE scanning — would discover a device (mocked at I/O level)
    //    We create a mock discovered device to represent the result.
    // ---------------------------------------------------------------
    const discoveredDevice = makeMockDevice();

    // ---------------------------------------------------------------
    // 4. ECDH key exchange — real tweetnacl crypto
    // ---------------------------------------------------------------
    // Mobile side
    const mobileSession = createPairingSession();
    expect(mobileSession.keyPair.publicKey).toBeInstanceOf(Uint8Array);
    expect(mobileSession.keyPair.publicKey.length).toBe(32);
    expect(mobileSession.sharedKey).toBeNull();

    // Desktop side (simulated)
    const desktopKeyPair = generateKeyPair();

    // Mobile completes pairing with desktop's public key
    const completedSession = completePairingSession(mobileSession, desktopKeyPair.publicKey);
    expect(completedSession.sharedKey).toBeInstanceOf(Uint8Array);
    expect(completedSession.sharedKey!.length).toBe(32);
    expect(completedSession.peerPublicKey).toEqual(desktopKeyPair.publicKey);

    // Desktop derives the same shared key
    const desktopSharedKey = nacl.box.before(
      mobileSession.keyPair.publicKey,
      desktopKeyPair.secretKey,
    );
    expect(completedSession.sharedKey).toEqual(desktopSharedKey);

    const sharedKey = completedSession.sharedKey!;

    // ---------------------------------------------------------------
    // 5. Pairing persistence — real save/load with mocked AsyncStorage
    // ---------------------------------------------------------------
    await savePairingInfo(discoveredDevice, completedSession);
    const loadedInfo = await loadPairingInfo();
    expect(loadedInfo).not.toBeNull();
    expect(loadedInfo!.deviceId).toBe(discoveredDevice.id);
    expect(loadedInfo!.deviceName).toBe(discoveredDevice.name);
    expect(loadedInfo!.sharedKeyBase64).toBe(publicKeyToBase64(sharedKey));

    // ---------------------------------------------------------------
    // 6. Image transfer message — real encryption + protocol envelope
    // ---------------------------------------------------------------
    const message = buildImageTransferMessage({
      image,
      imageData,
      sharedKey,
      imageIndex: 0,
      totalImages: 1,
    });

    const payload = message.payload as ImageTransferPayload;

    // ---------------------------------------------------------------
    // 7. Encryption verification — decrypt data_base64 and compare
    // ---------------------------------------------------------------
    const decrypted = decryptFromBase64(payload.data_base64, sharedKey);
    expect(decrypted).not.toBeNull();
    expect(decrypted).toEqual(imageData);

    // ---------------------------------------------------------------
    // 8. Checksum verification — compute checksum and compare
    // ---------------------------------------------------------------
    const expectedChecksum = computeChecksum(imageData);
    expect(payload.checksum_sha256).toBe(expectedChecksum);

    // ---------------------------------------------------------------
    // 9. Protocol validation — verify envelope structure
    // ---------------------------------------------------------------
    expect(isValidEnvelope(message)).toBe(true);
    expect(message.protocol_version).toBe(PROTOCOL_VERSION);
    expect(message.message_type).toBe('image_transfer');
    expect(typeof message.timestamp).toBe('string');
    expect(payload.image_index).toBe(0);
    expect(payload.total_images).toBe(1);
    expect(payload.filename).toBe('room_north.jpg');
    expect(payload.format).toBe('jpeg');
    expect(payload.width).toBe(1920);
    expect(payload.height).toBe(1080);

    // ---------------------------------------------------------------
    // 10. Ack handling — simulate desktop ack with matching checksum
    // ---------------------------------------------------------------
    const ack: AckResult = {
      imageIndex: 0,
      checksumMatch: true,
      status: 'ok',
      receivedChecksum: expectedChecksum,
    };
    expect(verifyAck(ack, expectedChecksum)).toBe(true);

    // Also verify that a mismatched ack fails
    const badAck: AckResult = {
      imageIndex: 0,
      checksumMatch: false,
      status: 'checksum_mismatch',
      receivedChecksum: 'deadbeef',
    };
    expect(verifyAck(badAck, expectedChecksum)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Focused integration tests
// ---------------------------------------------------------------------------

describe('Encryption roundtrip with ECDH-derived key', () => {
  it('encrypts and decrypts correctly using the shared key from key exchange', () => {
    // Simulate full ECDH between mobile and desktop
    const mobileSession = createPairingSession();
    const desktopKeyPair = generateKeyPair();
    const completed = completePairingSession(mobileSession, desktopKeyPair.publicKey);
    const sharedKey = completed.sharedKey!;

    const originalData = makeSampleImageData(4096);

    const image = makeMockImage();
    const message = buildImageTransferMessage({
      image,
      imageData: originalData,
      sharedKey,
      imageIndex: 0,
      totalImages: 1,
    });

    const payload = message.payload as ImageTransferPayload;
    const decrypted = decryptFromBase64(payload.data_base64, sharedKey);

    expect(decrypted).not.toBeNull();
    expect(decrypted).toEqual(originalData);
  });
});

describe('Checksum consistency between mobile and desktop', () => {
  it('produces a checksum that the desktop would compute identically', () => {
    const imageData = makeSampleImageData(2048);

    // Mobile computes checksum
    const mobileChecksum = computeChecksum(imageData);

    // Build the transfer message
    const mobileSession = createPairingSession();
    const desktopKeyPair = generateKeyPair();
    const completed = completePairingSession(mobileSession, desktopKeyPair.publicKey);
    const sharedKey = completed.sharedKey!;

    const message = buildImageTransferMessage({
      image: makeMockImage(),
      imageData,
      sharedKey,
      imageIndex: 0,
      totalImages: 1,
    });

    const payload = message.payload as ImageTransferPayload;

    // The checksum in the message should match what the desktop computes
    // from the same raw data (before encryption)
    expect(payload.checksum_sha256).toBe(mobileChecksum);

    // Desktop side: decrypt and recompute checksum
    const desktopSharedKey = nacl.box.before(
      mobileSession.keyPair.publicKey,
      desktopKeyPair.secretKey,
    );
    const decryptedData = decryptFromBase64(payload.data_base64, desktopSharedKey);
    expect(decryptedData).not.toBeNull();

    const desktopChecksum = computeChecksum(decryptedData!);
    expect(desktopChecksum).toBe(payload.checksum_sha256);
  });
});

describe('Protocol version validation accepts generated messages', () => {
  it('validates a message built by buildImageTransferMessage', () => {
    const mobileSession = createPairingSession();
    const desktopKeyPair = generateKeyPair();
    const completed = completePairingSession(mobileSession, desktopKeyPair.publicKey);

    const message = buildImageTransferMessage({
      image: makeMockImage(),
      imageData: makeSampleImageData(512),
      sharedKey: completed.sharedKey!,
      imageIndex: 0,
      totalImages: 1,
    });

    const result = validateProtocolVersion(message);
    expect(result.valid).toBe(true);
    expect(result.receivedVersion).toBe(PROTOCOL_VERSION);
    expect(result.expectedVersion).toBe(PROTOCOL_VERSION);
    expect(result.errorMessage).toBeUndefined();
  });
});
