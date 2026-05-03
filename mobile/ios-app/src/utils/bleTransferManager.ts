/**
 * Sequential batch image transfer manager for BLE communication.
 *
 * Orchestrates the transfer of multiple captured images over a Bluetooth
 * transport, sending them one at a time and reporting per-image progress
 * via a callback. Each image is built into a protocol message using
 * `buildImageTransferMessage`, serialized to JSON, and sent as raw bytes
 * through the transport layer.
 *
 * Usage:
 *   import { transferImageBatch } from './bleTransferManager';
 *
 *   const result = await transferImageBatch({
 *     images, imageDataArray, sharedKey, transport,
 *     onProgress: (p) => console.log(p.overallProgress),
 *   });
 */

import type { BluetoothTransport } from './bleTransport';
import type { CapturedImage } from '../../App';
import { buildImageTransferMessage } from './bleImageTransfer';
import { serializeMessage } from './bleProtocol';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Progress state for the batch transfer. */
export interface TransferProgress {
  /** Index of the current image being transferred (0-based). */
  currentImageIndex: number;
  /** Total number of images in the batch. */
  totalImages: number;
  /** Status of the current image: 'pending' | 'sending' | 'sent' | 'failed'. */
  currentImageStatus: 'pending' | 'sending' | 'sent' | 'failed';
  /** Overall batch progress as a fraction [0, 1]. */
  overallProgress: number;
  /** Whether the entire batch is complete. */
  complete: boolean;
}

/** Result of a single image transfer. */
export interface ImageTransferResult {
  imageIndex: number;
  success: boolean;
  error?: string;
}

/** Result of the entire batch transfer. */
export interface BatchTransferResult {
  totalImages: number;
  successCount: number;
  failedCount: number;
  results: ImageTransferResult[];
}

/** Callback for progress updates. */
export type TransferProgressCallback = (progress: TransferProgress) => void;

/** Options for the batch transfer. */
export interface BatchTransferOptions {
  /** The images to transfer. */
  images: CapturedImage[];
  /** Raw image data for each image (parallel array with images). */
  imageDataArray: Uint8Array[];
  /** The 32-byte shared encryption key. */
  sharedKey: Uint8Array;
  /** The connected BLE transport. */
  transport: BluetoothTransport;
  /** Progress callback. */
  onProgress?: TransferProgressCallback;
}

// ---------------------------------------------------------------------------
// Progress calculation
// ---------------------------------------------------------------------------

/**
 * Calculate overall batch progress as a fraction in [0, 1].
 *
 * Each image contributes an equal share of the total progress. An image
 * that has been sent (or failed) counts as fully complete for progress
 * purposes; an image currently being sent counts as half-complete.
 *
 * @param currentIndex  The 0-based index of the image currently being processed.
 * @param totalImages   The total number of images in the batch.
 * @param currentSent   Whether the current image has finished sending.
 * @returns A number in [0, 1] representing overall progress.
 */
export function calculateOverallProgress(
  currentIndex: number,
  totalImages: number,
  currentSent: boolean,
): number {
  if (totalImages <= 0) {
    return 1;
  }

  const completedImages = currentSent ? currentIndex + 1 : currentIndex;
  return completedImages / totalImages;
}

// ---------------------------------------------------------------------------
// Batch transfer
// ---------------------------------------------------------------------------

/**
 * Transfer a batch of images sequentially over the BLE transport.
 *
 * For each image in the batch:
 * 1. Calls `onProgress` with status `'sending'`
 * 2. Builds the `image_transfer` protocol message via `buildImageTransferMessage`
 * 3. Serializes the message to JSON
 * 4. Sends the JSON bytes via `transport.send()`
 * 5. Calls `onProgress` with status `'sent'` or `'failed'`
 * 6. Moves to the next image (continues even if one fails)
 *
 * @param options The batch transfer configuration.
 * @returns A BatchTransferResult summarizing successes and failures.
 */
export async function transferImageBatch(
  options: BatchTransferOptions,
): Promise<BatchTransferResult> {
  const { images, imageDataArray, sharedKey, transport, onProgress } = options;

  const totalImages = images.length;
  const results: ImageTransferResult[] = [];

  // Handle empty batch — nothing to send.
  if (totalImages === 0) {
    onProgress?.({
      currentImageIndex: 0,
      totalImages: 0,
      currentImageStatus: 'sent',
      overallProgress: 1,
      complete: true,
    });

    return {
      totalImages: 0,
      successCount: 0,
      failedCount: 0,
      results: [],
    };
  }

  for (let i = 0; i < totalImages; i++) {
    // 1. Report "sending" status.
    onProgress?.({
      currentImageIndex: i,
      totalImages,
      currentImageStatus: 'sending',
      overallProgress: calculateOverallProgress(i, totalImages, false),
      complete: false,
    });

    let success = false;
    let errorMessage: string | undefined;

    try {
      // 2. Build the image_transfer protocol message.
      const message = buildImageTransferMessage({
        image: images[i],
        imageData: imageDataArray[i],
        sharedKey,
        imageIndex: i,
        totalImages,
      });

      // 3. Serialize to JSON.
      const json = serializeMessage(message);

      // 4. Send the JSON bytes via transport.
      const encoder = new TextEncoder();
      const bytes = encoder.encode(json);
      success = await transport.send(bytes);

      if (!success) {
        errorMessage = 'transport.send() returned false';
      }
    } catch (err: unknown) {
      success = false;
      errorMessage =
        err instanceof Error ? err.message : 'Unknown error during transfer';
    }

    // 5. Report "sent" or "failed" status.
    const status = success ? 'sent' : 'failed';
    onProgress?.({
      currentImageIndex: i,
      totalImages,
      currentImageStatus: status,
      overallProgress: calculateOverallProgress(i, totalImages, true),
      complete: i === totalImages - 1,
    });

    // 6. Record the result and move to the next image.
    const result: ImageTransferResult = { imageIndex: i, success };
    if (errorMessage) {
      result.error = errorMessage;
    }
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;

  return {
    totalImages,
    successCount,
    failedCount: totalImages - successCount,
    results,
  };
}
