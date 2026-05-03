/**
 * BLE transfer failure notification.
 *
 * Shows a native Alert when an image transfer exhausts all retry attempts,
 * giving the user the option to retry manually or skip the image.
 *
 * See requirement 4.7: "IF re-transmission fails after 2 attempts,
 * THEN THE Mobile_App SHALL notify the user that the transfer failed
 * and provide an option to retry manually."
 */

import { Alert } from 'react-native';
import type { RetryTransferResult } from './bleRetryTransfer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the transfer failure notification. */
export interface TransferFailureOptions {
  /** Called when the user taps "Retry". */
  onRetry: () => void;
  /** Called when the user taps "Skip" (optional). */
  onSkip?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Alert title shown when a transfer fails. */
export const TRANSFER_FAILURE_TITLE = 'Transfer Failed';

/**
 * Build the failure message string.
 *
 * Pure function — easy to test without mocking Alert.
 *
 * @param filename  Name of the image file that failed to transfer.
 * @param attempts  Number of transfer attempts made.
 * @returns The formatted failure message.
 */
export function buildTransferFailureMessage(filename: string, attempts: number): string {
  return `Could not transfer "${filename}" after ${attempts} attempts.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show a failure notification if the transfer result indicates failure.
 *
 * If `result.success` is true, this is a no-op.
 * If `result.success` is false, shows an Alert with:
 * - Title: "Transfer Failed"
 * - Message: "Could not transfer "{filename}" after {attempts} attempts."
 * - Buttons: "Skip" (cancel) and "Retry" (default, calls onRetry)
 *
 * @param result    The outcome of the retry transfer process.
 * @param filename  Name of the image file that failed.
 * @param options   Callbacks for the alert buttons.
 */
export function showTransferFailureNotification(
  result: RetryTransferResult,
  filename: string,
  options: TransferFailureOptions,
): void {
  if (result.success) {
    return;
  }

  const message = buildTransferFailureMessage(filename, result.attempts);

  Alert.alert(TRANSFER_FAILURE_TITLE, message, [
    { text: 'Skip', style: 'cancel', onPress: options.onSkip },
    { text: 'Retry', onPress: options.onRetry },
  ]);
}
