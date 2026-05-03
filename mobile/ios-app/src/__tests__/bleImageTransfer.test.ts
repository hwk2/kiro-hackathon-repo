import nacl from 'tweetnacl';
import {
  computeChecksum,
  extractFormat,
  buildImageTransferMessage,
  type ImageTransferOptions,
} from '../utils/bleImageTransfer';
import { decryptFromBase64 } from '../utils/bleEncryption';
import { PROTOCOL_VERSION } from '../utils/bleProtocol';
import type { CapturedImage } from '../../App';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a valid 32-byte shared key (same as ECDH output). */
function makeSharedKey(): Uint8Array {
  return nacl.randomBytes(32);
}

/** Build sample image bytes of the given length. */
function makeImageData(length: number): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = i % 256;
  }
  return data;
}

/** Build a sample CapturedImage. */
function makeCapturedImage(overrides?: Partial<CapturedImage>): CapturedImage {
  return {
    uri: 'file:///tmp/photo.jpg',
    width: 1920,
    height: 1080,
    fileName: 'wall_north.jpg',
    fileSize: 245760,
    capturedAt: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

/** Build default ImageTransferOptions. */
function makeTransferOptions(overrides?: Partial<ImageTransferOptions>): ImageTransferOptions {
  return {
    image: makeCapturedImage(),
    imageData: makeImageData(1024),
    sharedKey: makeSharedKey(),
    imageIndex: 0,
    totalImages: 6,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeChecksum
// ---------------------------------------------------------------------------

describe('computeChecksum', () => {
  it('returns a lowercase hex string', () => {
    const data = new TextEncoder().encode('hello');
    const checksum = computeChecksum(data);

    expect(typeof checksum).toBe('string');
    expect(checksum).toMatch(/^[0-9a-f]+$/);
  });

  it('returns a 64-character hex string (256 bits)', () => {
    const data = new TextEncoder().encode('test data');
    const checksum = computeChecksum(data);

    expect(checksum.length).toBe(64);
  });

  it('is deterministic — same input produces the same output', () => {
    const data = new TextEncoder().encode('deterministic');
    const a = computeChecksum(data);
    const b = computeChecksum(data);

    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = computeChecksum(new TextEncoder().encode('input A'));
    const b = computeChecksum(new TextEncoder().encode('input B'));

    expect(a).not.toBe(b);
  });

  it('handles empty input', () => {
    const checksum = computeChecksum(new Uint8Array(0));

    expect(typeof checksum).toBe('string');
    expect(checksum.length).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// extractFormat
// ---------------------------------------------------------------------------

describe('extractFormat', () => {
  it('maps "jpg" to "jpeg"', () => {
    expect(extractFormat('photo.jpg')).toBe('jpeg');
  });

  it('maps "jpeg" to "jpeg"', () => {
    expect(extractFormat('photo.jpeg')).toBe('jpeg');
  });

  it('maps "png" to "png"', () => {
    expect(extractFormat('screenshot.png')).toBe('png');
  });

  it('maps "heic" to "heic"', () => {
    expect(extractFormat('IMG_0001.heic')).toBe('heic');
  });

  it('handles uppercase extensions', () => {
    expect(extractFormat('photo.JPG')).toBe('jpeg');
    expect(extractFormat('photo.PNG')).toBe('png');
    expect(extractFormat('photo.HEIC')).toBe('heic');
  });

  it('handles mixed-case extensions', () => {
    expect(extractFormat('photo.Jpg')).toBe('jpeg');
  });

  it('defaults to "jpeg" for unknown extensions', () => {
    expect(extractFormat('file.bmp')).toBe('jpeg');
    expect(extractFormat('file.tiff')).toBe('jpeg');
  });

  it('defaults to "jpeg" when there is no extension', () => {
    expect(extractFormat('noextension')).toBe('jpeg');
  });

  it('defaults to "jpeg" when filename ends with a dot', () => {
    expect(extractFormat('file.')).toBe('jpeg');
  });

  it('uses the last extension for filenames with multiple dots', () => {
    expect(extractFormat('my.photo.backup.png')).toBe('png');
  });
});

// ---------------------------------------------------------------------------
// buildImageTransferMessage
// ---------------------------------------------------------------------------

describe('buildImageTransferMessage', () => {
  it('creates a valid protocol message with message_type "image_transfer"', () => {
    const msg = buildImageTransferMessage(makeTransferOptions());

    expect(msg.message_type).toBe('image_transfer');
    expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
    expect(typeof msg.timestamp).toBe('string');
    expect(msg.payload).toBeDefined();
  });

  it('sets the correct image_index and total_images', () => {
    const msg = buildImageTransferMessage(
      makeTransferOptions({ imageIndex: 3, totalImages: 8 }),
    );

    expect(msg.payload.image_index).toBe(3);
    expect(msg.payload.total_images).toBe(8);
  });

  it('sets the correct filename from the CapturedImage', () => {
    const image = makeCapturedImage({ fileName: 'kitchen_east.png' });
    const msg = buildImageTransferMessage(makeTransferOptions({ image }));

    expect(msg.payload.filename).toBe('kitchen_east.png');
  });

  it('sets the correct dimensions from the CapturedImage', () => {
    const image = makeCapturedImage({ width: 3024, height: 4032 });
    const msg = buildImageTransferMessage(makeTransferOptions({ image }));

    expect(msg.payload.width).toBe(3024);
    expect(msg.payload.height).toBe(4032);
  });

  it('sets captured_at from the CapturedImage', () => {
    const image = makeCapturedImage({ capturedAt: '2025-06-01T12:00:00Z' });
    const msg = buildImageTransferMessage(makeTransferOptions({ image }));

    expect(msg.payload.captured_at).toBe('2025-06-01T12:00:00Z');
  });

  it('uses fileSize from CapturedImage when available', () => {
    const image = makeCapturedImage({ fileSize: 500000 });
    const msg = buildImageTransferMessage(
      makeTransferOptions({ image, imageData: makeImageData(1024) }),
    );

    expect(msg.payload.file_size_bytes).toBe(500000);
  });

  it('falls back to imageData.length when fileSize is undefined', () => {
    const image = makeCapturedImage({ fileSize: undefined });
    const imageData = makeImageData(2048);
    const msg = buildImageTransferMessage(makeTransferOptions({ image, imageData }));

    expect(msg.payload.file_size_bytes).toBe(2048);
  });

  it('extracts the format from the filename extension', () => {
    const image = makeCapturedImage({ fileName: 'room.png' });
    const msg = buildImageTransferMessage(makeTransferOptions({ image }));

    expect(msg.payload.format).toBe('png');
  });

  it('has encrypted data_base64 that is not the raw image data', () => {
    const imageData = makeImageData(512);
    const sharedKey = makeSharedKey();
    const msg = buildImageTransferMessage(makeTransferOptions({ imageData, sharedKey }));

    // data_base64 should be a non-empty base64 string.
    expect(typeof msg.payload.data_base64).toBe('string');
    expect(msg.payload.data_base64.length).toBeGreaterThan(0);
    expect(msg.payload.data_base64).toMatch(/^[A-Za-z0-9+/=]+$/);

    // The encrypted base64 should NOT be the same as a plain base64 of the raw data.
    let rawBinary = '';
    for (let i = 0; i < imageData.length; i++) {
      rawBinary += String.fromCharCode(imageData[i]);
    }
    const rawBase64 = btoa(rawBinary);
    expect(msg.payload.data_base64).not.toBe(rawBase64);
  });

  it('data_base64 can be decrypted back to the original image data', () => {
    const imageData = makeImageData(256);
    const sharedKey = makeSharedKey();
    const msg = buildImageTransferMessage(makeTransferOptions({ imageData, sharedKey }));

    const decrypted = decryptFromBase64(msg.payload.data_base64, sharedKey);

    expect(decrypted).not.toBeNull();
    expect(decrypted).toEqual(imageData);
  });

  it('has a checksum_sha256 field that is a 64-char hex string', () => {
    const msg = buildImageTransferMessage(makeTransferOptions());

    expect(typeof msg.payload.checksum_sha256).toBe('string');
    expect(msg.payload.checksum_sha256.length).toBe(64);
    expect(msg.payload.checksum_sha256).toMatch(/^[0-9a-f]+$/);
  });

  it('checksum matches the original unencrypted image data', () => {
    const imageData = makeImageData(1024);
    const msg = buildImageTransferMessage(makeTransferOptions({ imageData }));

    // Recompute the checksum independently.
    const fullHash = nacl.hash(imageData);
    const truncated = fullHash.slice(0, 32);
    let expectedHex = '';
    for (let i = 0; i < truncated.length; i++) {
      expectedHex += truncated[i].toString(16).padStart(2, '0');
    }

    expect(msg.payload.checksum_sha256).toBe(expectedHex);
  });
});
