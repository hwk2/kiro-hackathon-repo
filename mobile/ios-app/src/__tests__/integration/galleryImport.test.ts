/**
 * Integration tests: gallery import format handling pipeline.
 *
 * Verifies the full format handling flow for gallery-imported images:
 *   extension validation → format extraction → protocol message building
 *
 * Uses real implementations of isSupportedExtension, extractFormat, and
 * buildImageTransferMessage. Only a dummy shared key is needed since
 * tweetnacl works in Jest.
 *
 * Validates: Requirements 1.4 — JPEG, PNG, and HEIC format support
 */

import nacl from 'tweetnacl';
import type { CapturedImage } from '../../../App';
import { isSupportedExtension } from '../../utils/imageValidation';
import {
  extractFormat,
  buildImageTransferMessage,
} from '../../utils/bleImageTransfer';
import type { ImageTransferPayload } from '../../utils/bleProtocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a deterministic 32-byte shared key for testing. */
function makeSharedKey(): Uint8Array {
  const keyPair = nacl.box.keyPair();
  const peerKeyPair = nacl.box.keyPair();
  return nacl.box.before(peerKeyPair.publicKey, keyPair.secretKey);
}

/** Build sample image bytes. */
function makeSampleImageData(size: number = 512): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }
  return data;
}

/** Create a CapturedImage with the given filename. */
function makeCapturedImage(fileName: string): CapturedImage {
  return {
    uri: `file:///tmp/${fileName}`,
    width: 1920,
    height: 1080,
    fileName,
    fileSize: 512,
    capturedAt: '2025-01-15T10:30:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Gallery import format handling pipeline', () => {
  const sharedKey = makeSharedKey();
  const imageData = makeSampleImageData();

  // -----------------------------------------------------------------------
  // JPEG files
  // -----------------------------------------------------------------------
  describe('JPEG files', () => {
    it.each(['photo.jpg', 'photo.jpeg'])(
      '%s passes validation and produces format "jpeg" in transfer message',
      (fileName) => {
        expect(isSupportedExtension(fileName)).toBe(true);
        expect(extractFormat(fileName)).toBe('jpeg');

        const message = buildImageTransferMessage({
          image: makeCapturedImage(fileName),
          imageData,
          sharedKey,
          imageIndex: 0,
          totalImages: 1,
        });

        const payload = message.payload as ImageTransferPayload;
        expect(payload.format).toBe('jpeg');
        expect(payload.filename).toBe(fileName);
      },
    );
  });

  // -----------------------------------------------------------------------
  // PNG files
  // -----------------------------------------------------------------------
  describe('PNG files', () => {
    it('passes validation and produces format "png" in transfer message', () => {
      const fileName = 'room_shot.png';

      expect(isSupportedExtension(fileName)).toBe(true);
      expect(extractFormat(fileName)).toBe('png');

      const message = buildImageTransferMessage({
        image: makeCapturedImage(fileName),
        imageData,
        sharedKey,
        imageIndex: 0,
        totalImages: 1,
      });

      const payload = message.payload as ImageTransferPayload;
      expect(payload.format).toBe('png');
      expect(payload.filename).toBe(fileName);
    });
  });

  // -----------------------------------------------------------------------
  // HEIC files
  // -----------------------------------------------------------------------
  describe('HEIC files', () => {
    it('passes validation and produces format "heic" in transfer message', () => {
      const fileName = 'IMG_0042.heic';

      expect(isSupportedExtension(fileName)).toBe(true);
      expect(extractFormat(fileName)).toBe('heic');

      const message = buildImageTransferMessage({
        image: makeCapturedImage(fileName),
        imageData,
        sharedKey,
        imageIndex: 0,
        totalImages: 1,
      });

      const payload = message.payload as ImageTransferPayload;
      expect(payload.format).toBe('heic');
      expect(payload.filename).toBe(fileName);
    });
  });

  // -----------------------------------------------------------------------
  // HEIF files
  // -----------------------------------------------------------------------
  describe('HEIF files', () => {
    it('passes validation and produces format "heif" in transfer message', () => {
      const fileName = 'IMG_0099.heif';

      expect(isSupportedExtension(fileName)).toBe(true);
      expect(extractFormat(fileName)).toBe('heif');

      const message = buildImageTransferMessage({
        image: makeCapturedImage(fileName),
        imageData,
        sharedKey,
        imageIndex: 0,
        totalImages: 1,
      });

      const payload = message.payload as ImageTransferPayload;
      expect(payload.format).toBe('heif');
      expect(payload.filename).toBe(fileName);
    });
  });

  // -----------------------------------------------------------------------
  // Unsupported formats
  // -----------------------------------------------------------------------
  describe('Unsupported formats', () => {
    it.each(['image.bmp', 'animation.gif', 'photo.webp', 'scan.tiff'])(
      'rejects %s via isSupportedExtension',
      (fileName) => {
        expect(isSupportedExtension(fileName)).toBe(false);
      },
    );
  });

  // -----------------------------------------------------------------------
  // Uppercase extensions
  // -----------------------------------------------------------------------
  describe('Uppercase extensions', () => {
    it.each([
      ['photo.JPG', 'jpeg'],
      ['photo.JPEG', 'jpeg'],
      ['photo.PNG', 'png'],
      ['photo.HEIC', 'heic'],
      ['photo.HEIF', 'heif'],
    ])(
      '%s passes validation and produces format "%s"',
      (fileName, expectedFormat) => {
        expect(isSupportedExtension(fileName)).toBe(true);
        expect(extractFormat(fileName)).toBe(expectedFormat);

        const message = buildImageTransferMessage({
          image: makeCapturedImage(fileName),
          imageData,
          sharedKey,
          imageIndex: 0,
          totalImages: 1,
        });

        const payload = message.payload as ImageTransferPayload;
        expect(payload.format).toBe(expectedFormat);
      },
    );
  });

  // -----------------------------------------------------------------------
  // Full pipeline: validate → extract → build → verify
  // -----------------------------------------------------------------------
  describe('Full pipeline', () => {
    it.each([
      ['room_north.jpg', 'jpeg'],
      ['room_south.jpeg', 'jpeg'],
      ['room_east.png', 'png'],
      ['room_west.heic', 'heic'],
      ['room_ceiling.heif', 'heif'],
    ])(
      '%s: validate extension → extract format → build message → verify payload',
      (fileName, expectedFormat) => {
        // Step 1: Validate extension
        expect(isSupportedExtension(fileName)).toBe(true);

        // Step 2: Extract format
        const format = extractFormat(fileName);
        expect(format).toBe(expectedFormat);

        // Step 3: Build transfer message
        const image = makeCapturedImage(fileName);
        const message = buildImageTransferMessage({
          image,
          imageData,
          sharedKey,
          imageIndex: 2,
          totalImages: 6,
        });

        // Step 4: Verify protocol envelope and payload
        expect(message.message_type).toBe('image_transfer');
        expect(message.protocol_version).toBe('1.0');

        const payload = message.payload as ImageTransferPayload;
        expect(payload.format).toBe(expectedFormat);
        expect(payload.filename).toBe(fileName);
        expect(payload.image_index).toBe(2);
        expect(payload.total_images).toBe(6);
        expect(payload.width).toBe(1920);
        expect(payload.height).toBe(1080);
        expect(typeof payload.checksum_sha256).toBe('string');
        expect(payload.checksum_sha256.length).toBe(64);
        expect(typeof payload.data_base64).toBe('string');
        expect(payload.data_base64.length).toBeGreaterThan(0);
      },
    );
  });
});
