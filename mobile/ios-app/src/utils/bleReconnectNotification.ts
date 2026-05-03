/**
 * BLE reconnect failure notification.
 *
 * Shows a native Alert when auto-reconnect exhausts all attempts,
 * giving the user the option to re-initiate pairing or dismiss.
 *
 * See requirement 3.8: "IF automatic reconnection fails after 3 attempts,
 * THEN THE Mobile_App SHALL notify the user and provide an option to
 * re-initiate pairing."
 */

import { Alert } from 'react-native';
import type { ReconnectResult } from './bleAutoReconnect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the failure notification. */
export interface FailureNotificationOptions {
  /** Called when the user taps "Re-pair". */
  onRePair: () => void;
  /** Called when the user taps "Dismiss" (optional). */
  onDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Alert title shown when reconnection fails. */
export const FAILURE_TITLE = 'Connection Failed';

/**
 * Build the failure message string.
 *
 * Pure function — easy to test without mocking Alert.
 *
 * @param deviceName  Human-readable device name.
 * @param attempts    Number of reconnection attempts made.
 * @returns The formatted failure message.
 */
export function buildFailureMessage(deviceName: string, attempts: number): string {
  return `Could not reconnect to ${deviceName} after ${attempts} attempts.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show a failure notification if the reconnect result indicates failure.
 *
 * If `result.success` is true, this is a no-op.
 * If `result.success` is false, shows an Alert with:
 * - Title: "Connection Failed"
 * - Message: "Could not reconnect to {deviceName} after {attempts} attempts."
 * - Buttons: "Dismiss" (cancel) and "Re-pair" (calls onRePair)
 *
 * @param result      The outcome of the auto-reconnect process.
 * @param deviceName  Human-readable device name.
 * @param options     Callbacks for the alert buttons.
 */
export function showReconnectFailureNotification(
  result: ReconnectResult,
  deviceName: string,
  options: FailureNotificationOptions,
): void {
  if (result.success) {
    return;
  }

  const message = buildFailureMessage(deviceName, result.attempts);

  Alert.alert(FAILURE_TITLE, message, [
    { text: 'Dismiss', style: 'cancel', onPress: options.onDismiss },
    { text: 'Re-pair', onPress: options.onRePair },
  ]);
}
