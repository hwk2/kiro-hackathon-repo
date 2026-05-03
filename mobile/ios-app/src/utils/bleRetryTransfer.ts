/**
 * Auto-retry wrapper for single-image BLE transfers.
 *
 * Wraps the image transfer + ack verification flow with automatic retry
 * logic on checksum mismatch. Per requirement 4.6, if a checksum mismatch
 * is detected the affected image is re-transmitted up to 2 times
 * (3 total attempts: 1 initial + 2 retries).
 *
 * Usage:
 *   import { transferWithRetry } from './bleRetryTransfer';
 *
 *   const result = await transferWithRetry({
 *     image, imageData, sharedKey, imageIndex: 0, totalImages: 6,
 *     transport,
 *     onRetry: (idx, attempt, max) => console.log(`Retry ${attempt}/${max}`),
 *   });
 */

import type { BluetoothTransport } from './bleTransport';
import type { CapturedImage } from '../../App';
import { buildImageTransferMessage, computeChecksum } from './bleImageTransfer';
import { serializeMessage } from './bleProtocol';
import { waitForAck, verifyAck } from './bleAckHandler';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of retries after the initial attempt. */
export const MAX_RETRIES = 2;

/** Default timeout for waiting for an ack (30 seconds). */
const DEFAULT_ACK_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a single image transfer with retries. */
export interface RetryTransferResult {
  /** The image index in the batch. */
  imageIndex: number;
  /** Whether the transfer ultimately succeeded. */
  success: boolean;
  /** Total number of attempts made (1 = first try only, up to 3). */
  attempts: number;
  /** Whether the checksum was verified successfully. */
  checksumVerified: boolean;
  /** Error description if the transfer failed. */
  error?: string;
}

/** Callback for retry status updates. */
export type RetryStatusCallback = (
  imageIndex: number,
  attempt: number,
  maxRetries: number,
) => void;

/** Options for transferring a single image with retry. */
export interface RetryTransferOptions {
  /** The captured image metadata. */
  image: CapturedImage;
  /** Raw image bytes. */
  imageData: Uint8Array;
  /** The 32-byte shared encryption key from ECDH. */
  sharedKey: Uint8Array;
  /** Index of this image in the batch (0-based). */
  imageIndex: number;
  /** Total number of images in the batch. */
  totalImages: number;
  /** The connected BLE transport. */
  transport: BluetoothTransport;
  /** Called when a retry is about to happen. */
  onRetry?: RetryStatusCallback;
  /** Timeout for waiting for ack (default 30000ms). */
  ackTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Transfer with retry
// ---------------------------------------------------------------------------

/**
 * Send a single image over BLE with automatic retry on checksum mismatch.
 *
 * Flow per attempt:
 * 1. Build the image_transfer protocol message
 * 2. Serialize to JSON and send via transport
 * 3. Wait for transfer_ack via `waitForAck()`
 * 4. If ack is null (timeout) → fail immediately (no retry)
 * 5. If ack status is 'ok' and checksum matches → success
 * 6. If checksum mismatch and retries remaining → call onRetry, retry
 * 7. If checksum mismatch and no retries remaining → fail
 *
 * Transport send failures also fail immediately without retry, since they
 * indicate a connectivity issue rather than a data integrity issue.
 *
 * @param options Transfer configuration including image, transport, and callbacks.
 * @returns A RetryTransferResult summarizing the outcome.
 */
export async function transferWithRetry(
  options: RetryTransferOptions,
): Promise<RetryTransferResult> {
  const {
    image,
    imageData,
    sharedKey,
    imageIndex,
    totalImages,
    transport,
    onRetry,
    ackTimeoutMs = DEFAULT_ACK_TIMEOUT_MS,
  } = options;

  const expectedChecksum = computeChecksum(imageData);
  let attempts = 0;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    attempts = retry + 1;

    // If this is a retry (not the first attempt), notify the caller.
    if (retry > 0) {
      onRetry?.(imageIndex, retry, MAX_RETRIES);
    }

    // 1. Build the image_transfer protocol message.
    let message;
    try {
      message = buildImageTransferMessage({
        image,
        imageData,
        sharedKey,
        imageIndex,
        totalImages,
      });
    } catch (err: unknown) {
      return {
        imageIndex,
        success: false,
        attempts,
        checksumVerified: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to build transfer message',
      };
    }

    // 2. Serialize and send via transport.
    let sendSuccess: boolean;
    try {
      const json = serializeMessage(message);
      const encoder = new TextEncoder();
      const bytes = encoder.encode(json);
      sendSuccess = await transport.send(bytes);
    } catch (err: unknown) {
      return {
        imageIndex,
        success: false,
        attempts,
        checksumVerified: false,
        error:
          err instanceof Error
            ? err.message
            : 'Transport send failed',
      };
    }

    if (!sendSuccess) {
      return {
        imageIndex,
        success: false,
        attempts,
        checksumVerified: false,
        error: 'transport.send() returned false',
      };
    }

    // 3. Wait for transfer_ack.
    const ack = await waitForAck(transport, imageIndex, ackTimeoutMs);

    // 4. Timeout — fail immediately (no retry).
    if (ack === null) {
      return {
        imageIndex,
        success: false,
        attempts,
        checksumVerified: false,
        error: 'Timed out waiting for transfer acknowledgement',
      };
    }

    // 5. Verify checksum.
    if (verifyAck(ack, expectedChecksum)) {
      return {
        imageIndex,
        success: true,
        attempts,
        checksumVerified: true,
      };
    }

    // 6/7. Checksum mismatch — retry if attempts remain, otherwise fail.
    // The loop will continue to the next iteration if retries remain.
  }

  // All retries exhausted — checksum never matched.
  return {
    imageIndex,
    success: false,
    attempts,
    checksumVerified: false,
    error: `Checksum mismatch after ${attempts} attempts`,
  };
}
