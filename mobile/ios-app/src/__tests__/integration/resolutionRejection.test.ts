/**
 * Integration tests for resolution validation and rejection.
 *
 * Validates Requirement 1.5: "WHEN an image has a resolution below 480x480
 * pixels, THE Mobile_App SHALL reject the image and display a message stating
 * the minimum resolution requirement."
 *
 * Tests boundary conditions, common device resolutions, edge cases, asymmetric
 * dimensions, square images, and integration with the transfer pipeline.
 */

import type { CapturedImage } from '../../../App';
import { isValidResolution, MIN_RESOLUTION } from '../../utils/imageValidation';
import { buildImageTransferMessage } from '../../utils/bleImageTransfer';
import type { ImageTransferPayload } from '../../utils/bleProtocol';
import { generateKeyPair } from '../../utils/bleKeyExchange';
import nacl from 'tweetnacl';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockImage(overrides?: Partial<CapturedImage>): CapturedImage {
  return {
    uri: 'file:///tmp/test_image.jpg',
    width: 1920,
    height: 1080,
    fileName: 'test_image.jpg',
    fileSize: 4096,
    capturedAt: '2025-06-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeSampleImageData(size: number = 1024): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }
  return data;
}

/** Derive a shared key from two key pairs for encryption tests. */
function deriveSharedKey(): Uint8Array {
  const mobileKp = generateKeyPair();
  const desktopKp = generateKeyPair();
  return nacl.box.before(desktopKp.publicKey, mobileKp.secretKey);
}

// ---------------------------------------------------------------------------
// Boundary tests — exactly at and around the 480 threshold
// ---------------------------------------------------------------------------

describe('Resolution boundary conditions', () => {
  it('accepts exactly 480x480 (minimum threshold)', () => {
    expect(isValidResolution(480, 480)).toBe(true);
  });

  it('rejects 479x480 (width one pixel below minimum)', () => {
    expect(isValidResolution(479, 480)).toBe(false);
  });

  it('rejects 480x479 (height one pixel below minimum)', () => {
    expect(isValidResolution(480, 479)).toBe(false);
  });

  it('rejects 479x479 (both dimensions one pixel below minimum)', () => {
    expect(isValidResolution(479, 479)).toBe(false);
  });

  it('accepts 481x481 (one pixel above minimum on both axes)', () => {
    expect(isValidResolution(481, 481)).toBe(true);
  });

  it('confirms MIN_RESOLUTION constant is 480', () => {
    expect(MIN_RESOLUTION).toBe(480);
  });
});

// ---------------------------------------------------------------------------
// Common device camera resolutions
// ---------------------------------------------------------------------------

describe('Common device camera resolutions', () => {
  const commonResolutions: Array<{ label: string; width: number; height: number }> = [
    { label: '1080p landscape', width: 1920, height: 1080 },
    { label: '1080p portrait', width: 1080, height: 1920 },
    { label: 'iPhone 15 Pro rear', width: 3024, height: 4032 },
    { label: '4K photo', width: 4000, height: 3000 },
    { label: '720p', width: 1280, height: 720 },
    { label: 'iPad screenshot', width: 2048, height: 2732 },
    { label: '8MP standard', width: 3264, height: 2448 },
  ];

  it.each(commonResolutions)(
    'accepts $label ($width x $height)',
    ({ width, height }) => {
      expect(isValidResolution(width, height)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('rejects 0x0 dimensions', () => {
    expect(isValidResolution(0, 0)).toBe(false);
  });

  it('rejects 1x1 dimensions', () => {
    expect(isValidResolution(1, 1)).toBe(false);
  });

  it('rejects negative width', () => {
    expect(isValidResolution(-1, 480)).toBe(false);
  });

  it('rejects negative height', () => {
    expect(isValidResolution(480, -1)).toBe(false);
  });

  it('rejects both negative dimensions', () => {
    expect(isValidResolution(-100, -200)).toBe(false);
  });

  it('accepts very large dimensions', () => {
    expect(isValidResolution(10000, 10000)).toBe(true);
  });

  it('accepts extremely large dimensions (50MP equivalent)', () => {
    expect(isValidResolution(8688, 5792)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Asymmetric resolutions
// ---------------------------------------------------------------------------

describe('Asymmetric resolutions', () => {
  it('accepts 480x1920 (narrow but tall, both >= 480)', () => {
    expect(isValidResolution(480, 1920)).toBe(true);
  });

  it('accepts 1920x480 (wide but short, both >= 480)', () => {
    expect(isValidResolution(1920, 480)).toBe(true);
  });

  it('rejects 320x1920 (width too small)', () => {
    expect(isValidResolution(320, 1920)).toBe(false);
  });

  it('rejects 1920x320 (height too small)', () => {
    expect(isValidResolution(1920, 320)).toBe(false);
  });

  it('rejects 100x5000 (width far below minimum)', () => {
    expect(isValidResolution(100, 5000)).toBe(false);
  });

  it('rejects 5000x100 (height far below minimum)', () => {
    expect(isValidResolution(5000, 100)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Square images
// ---------------------------------------------------------------------------

describe('Square images', () => {
  it('accepts 480x480 (exact minimum square)', () => {
    expect(isValidResolution(480, 480)).toBe(true);
  });

  it('rejects 479x479 (just below minimum square)', () => {
    expect(isValidResolution(479, 479)).toBe(false);
  });

  it('accepts 1000x1000', () => {
    expect(isValidResolution(1000, 1000)).toBe(true);
  });

  it('accepts 4032x4032 (large square)', () => {
    expect(isValidResolution(4032, 4032)).toBe(true);
  });

  it('rejects 240x240 (well below minimum square)', () => {
    expect(isValidResolution(240, 240)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration with transfer pipeline
// ---------------------------------------------------------------------------

describe('Integration with transfer pipeline', () => {
  const sharedKey = deriveSharedKey();
  const imageData = makeSampleImageData(2048);

  it('builds a transfer message for a valid-resolution image with matching dimensions', () => {
    const image = makeMockImage({ width: 1920, height: 1080 });

    // Confirm the image passes validation
    expect(isValidResolution(image.width, image.height)).toBe(true);

    // Build the transfer message
    const message = buildImageTransferMessage({
      image,
      imageData,
      sharedKey,
      imageIndex: 0,
      totalImages: 1,
    });

    const payload = message.payload as ImageTransferPayload;

    // Dimensions in the transfer message must match the source image
    expect(payload.width).toBe(1920);
    expect(payload.height).toBe(1080);
    expect(payload.filename).toBe('test_image.jpg');
  });

  it('builds a transfer message for a minimum-resolution image (480x480)', () => {
    const image = makeMockImage({ width: 480, height: 480 });

    expect(isValidResolution(image.width, image.height)).toBe(true);

    const message = buildImageTransferMessage({
      image,
      imageData,
      sharedKey,
      imageIndex: 0,
      totalImages: 1,
    });

    const payload = message.payload as ImageTransferPayload;
    expect(payload.width).toBe(480);
    expect(payload.height).toBe(480);
  });

  it('validates that a below-minimum image would be rejected before transfer', () => {
    const image = makeMockImage({ width: 320, height: 240 });

    // The validation gate rejects this image
    expect(isValidResolution(image.width, image.height)).toBe(false);

    // In the real app, buildImageTransferMessage would never be called
    // for a rejected image. The validation check is the gate.
  });

  it('preserves dimensions through the transfer message for an asymmetric valid image', () => {
    const image = makeMockImage({ width: 480, height: 4032 });

    expect(isValidResolution(image.width, image.height)).toBe(true);

    const message = buildImageTransferMessage({
      image,
      imageData,
      sharedKey,
      imageIndex: 2,
      totalImages: 5,
    });

    const payload = message.payload as ImageTransferPayload;
    expect(payload.width).toBe(480);
    expect(payload.height).toBe(4032);
    expect(payload.image_index).toBe(2);
    expect(payload.total_images).toBe(5);
  });
});
