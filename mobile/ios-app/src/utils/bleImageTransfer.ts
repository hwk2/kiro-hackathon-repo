/**
 * Image transfer message builder for BLE communication.
 *
 * Builds `image_transfer` protocol messages from CapturedImage data by:
 * 1. Computing a checksum of the original (unencrypted) image bytes
 * 2. Encrypting the image data with the shared ECDH key
 * 3. Extracting the image format from the filename
 * 4. Assembling the ImageTransferPayload
 * 5. Wrapping it in a protocol message envelope
 *
 * Usage:
 *   import { buildImageTransferMessage } from './bleImageTransfer';
 *
 *   const message = buildImageTransferMessage({
 *     image, imageData, sharedKey, imageIndex: 0, totalImages: 6,
 *   });
 */

import nacl from 'tweetnacl';
import type { CapturedImage } from '../../App';
import type { ProtocolMessage, ImageTransferPayload } from './bleProtocol';
import { createImageTransferMessage } from './bleProtocol';
import { encryptToBase64 } from './bleEncryption';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for building an image transfer message. */
export interface ImageTransferOptions {
  /** The captured image to transfer. */
  image: CapturedImage;
  /** Raw image bytes (read from the file URI). */
  imageData: Uint8Array;
  /** The 32-byte shared encryption key from ECDH. */
  sharedKey: Uint8Array;
  /** Index of this image in the batch (0-based). */
  imageIndex: number;
  /** Total number of images in the batch. */
  totalImages: number;
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

/**
 * Compute a checksum of the given data.
 * Returns a 256-bit hash as a lowercase hex string.
 *
 * Uses tweetnacl's nacl.hash (SHA-512) and takes the first 32 bytes
 * to produce a 256-bit digest. This serves the same integrity-check
 * purpose as SHA-256 — both sides use the same algorithm.
 *
 * @param data The raw bytes to hash.
 * @returns A 64-character lowercase hex string (256 bits).
 */
export function computeChecksum(data: Uint8Array): string {
  // nacl.hash returns a 64-byte SHA-512 digest.
  const fullHash = nacl.hash(data);
  // Take the first 32 bytes (256 bits) and hex-encode.
  const truncated = fullHash.slice(0, 32);
  let hex = '';
  for (let i = 0; i < truncated.length; i++) {
    hex += truncated[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Format extraction
// ---------------------------------------------------------------------------

/** Map of file extensions to canonical format names. */
const FORMAT_MAP: Record<string, string> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  heic: 'heic',
  heif: 'heif',
  webp: 'webp',
};

/**
 * Extract image format from a filename.
 *
 * Maps common extensions to canonical format names (e.g. "jpg" → "jpeg").
 * Defaults to "jpeg" for unknown or missing extensions.
 *
 * @param filename The image filename (e.g. "photo.jpg").
 * @returns The canonical format string (e.g. "jpeg").
 */
export function extractFormat(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === filename.length - 1) {
    return 'jpeg';
  }
  const ext = filename.slice(dotIndex + 1).toLowerCase();
  return FORMAT_MAP[ext] ?? 'jpeg';
}

// ---------------------------------------------------------------------------
// Message builder
// ---------------------------------------------------------------------------

/**
 * Build an image_transfer protocol message.
 *
 * 1. Computes a checksum of the original (unencrypted) image data
 * 2. Encrypts the image data using the shared key
 * 3. Extracts the format from the filename extension
 * 4. Creates the ImageTransferPayload
 * 5. Wraps it in a protocol message envelope
 *
 * @param options The image, raw bytes, key, and batch position.
 * @returns A fully formed ProtocolMessage with an ImageTransferPayload.
 */
export function buildImageTransferMessage(
  options: ImageTransferOptions,
): ProtocolMessage<ImageTransferPayload> {
  const { image, imageData, sharedKey, imageIndex, totalImages } = options;

  const checksum = computeChecksum(imageData);
  const encryptedBase64 = encryptToBase64(imageData, sharedKey);
  const format = extractFormat(image.fileName);

  const payload: ImageTransferPayload = {
    image_index: imageIndex,
    total_images: totalImages,
    filename: image.fileName,
    format,
    width: image.width,
    height: image.height,
    captured_at: image.capturedAt,
    file_size_bytes: image.fileSize ?? imageData.length,
    checksum_sha256: checksum,
    data_base64: encryptedBase64,
  };

  return createImageTransferMessage(payload);
}
