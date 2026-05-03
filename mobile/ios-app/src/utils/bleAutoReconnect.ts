/**
 * BLE auto-reconnect utilities.
 *
 * Attempts to reconnect to a previously paired BLE device up to
 * {@link MAX_RECONNECT_ATTEMPTS} times at {@link RECONNECT_INTERVAL_MS}
 * intervals. The actual connection logic is injected via a `connectFn`
 * callback so the reconnect loop can be tested without real BLE hardware.
 *
 * See requirement 3.7: "IF the Bluetooth connection is lost, THEN THE
 * Mobile_App SHALL attempt to reconnect automatically up to 3 times at
 * 5-second intervals."
 */

import {
  createConnectionState,
  type ConnectionState,
} from './bleConnectionManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of reconnection attempts before giving up. */
export const MAX_RECONNECT_ATTEMPTS = 3;

/** Delay in milliseconds between consecutive reconnection attempts. */
export const RECONNECT_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback invoked whenever the connection state changes during reconnection. */
export type ReconnectStateCallback = (state: ConnectionState) => void;

/** Result returned when the reconnect process finishes (success or failure). */
export interface ReconnectResult {
  /** Whether the reconnection ultimately succeeded. */
  success: boolean;
  /** Total number of attempts made (1-based). */
  attempts: number;
  /** The final ConnectionState at the end of the process. */
  finalState: ConnectionState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return a Promise that resolves after `ms` milliseconds, but can be
 * canceled early via the returned `cancel` function.
 */
function cancelableDelay(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rejectFn: (() => void) | null = null;

  const promise = new Promise<void>((resolve, reject) => {
    rejectFn = reject;
    timer = setTimeout(resolve, ms);
  });

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    rejectFn?.();
  };

  return { promise, cancel };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to reconnect to a BLE device.
 *
 * Tries up to {@link MAX_RECONNECT_ATTEMPTS} times, waiting
 * {@link RECONNECT_INTERVAL_MS} between each failed attempt.
 *
 * @param deviceId      BLE device identifier.
 * @param deviceName    Human-readable device name.
 * @param connectFn     Async function that attempts a BLE connection.
 *                      Returns `true` on success, `false` on failure.
 * @param onStateChange Called with the updated ConnectionState at each step.
 * @returns A ReconnectResult describing the outcome.
 */
export async function attemptReconnect(
  deviceId: string,
  deviceName: string,
  connectFn: (deviceId: string) => Promise<boolean>,
  onStateChange: ReconnectStateCallback,
): Promise<ReconnectResult> {
  for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    // Notify: reconnecting (attempt N)
    const reconnectingState = createConnectionState(
      'reconnecting',
      deviceId,
      deviceName,
      attempt,
    );
    onStateChange(reconnectingState);

    const success = await connectFn(deviceId);

    if (success) {
      const connectedState = createConnectionState('connected', deviceId, deviceName);
      onStateChange(connectedState);
      return { success: true, attempts: attempt, finalState: connectedState };
    }

    // If not the last attempt, wait before retrying.
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      await new Promise<void>((resolve) => setTimeout(resolve, RECONNECT_INTERVAL_MS));
    }
  }

  // All attempts exhausted.
  const disconnectedState = createConnectionState('disconnected', deviceId, deviceName);
  onStateChange(disconnectedState);
  return {
    success: false,
    attempts: MAX_RECONNECT_ATTEMPTS,
    finalState: disconnectedState,
  };
}

/**
 * Create a cancelable reconnect process.
 *
 * Behaves identically to {@link attemptReconnect} but returns a `cancel`
 * function that aborts the loop. When canceled the promise resolves with
 * `{ success: false, attempts: <current>, finalState: disconnected }`.
 *
 * @param deviceId      BLE device identifier.
 * @param deviceName    Human-readable device name.
 * @param connectFn     Async function that attempts a BLE connection.
 * @param onStateChange Called with the updated ConnectionState at each step.
 * @returns An object with `promise` (the reconnect result) and `cancel`.
 */
export function createCancelableReconnect(
  deviceId: string,
  deviceName: string,
  connectFn: (deviceId: string) => Promise<boolean>,
  onStateChange: ReconnectStateCallback,
): { promise: Promise<ReconnectResult>; cancel: () => void } {
  let canceled = false;
  let activeDelay: { cancel: () => void } | null = null;

  const cancel = () => {
    canceled = true;
    activeDelay?.cancel();
  };

  const promise = (async (): Promise<ReconnectResult> => {
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (canceled) {
        const disconnectedState = createConnectionState('disconnected', deviceId, deviceName);
        onStateChange(disconnectedState);
        return { success: false, attempts: attempt - 1, finalState: disconnectedState };
      }

      // Notify: reconnecting (attempt N)
      const reconnectingState = createConnectionState(
        'reconnecting',
        deviceId,
        deviceName,
        attempt,
      );
      onStateChange(reconnectingState);

      const success = await connectFn(deviceId);

      if (canceled) {
        const disconnectedState = createConnectionState('disconnected', deviceId, deviceName);
        onStateChange(disconnectedState);
        return { success: false, attempts: attempt, finalState: disconnectedState };
      }

      if (success) {
        const connectedState = createConnectionState('connected', deviceId, deviceName);
        onStateChange(connectedState);
        return { success: true, attempts: attempt, finalState: connectedState };
      }

      // If not the last attempt, wait before retrying (cancelable).
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        const delay = cancelableDelay(RECONNECT_INTERVAL_MS);
        activeDelay = delay;
        try {
          await delay.promise;
        } catch {
          // Delay was canceled — exit the loop.
          const disconnectedState = createConnectionState('disconnected', deviceId, deviceName);
          onStateChange(disconnectedState);
          return { success: false, attempts: attempt, finalState: disconnectedState };
        } finally {
          activeDelay = null;
        }
      }
    }

    // All attempts exhausted.
    const disconnectedState = createConnectionState('disconnected', deviceId, deviceName);
    onStateChange(disconnectedState);
    return {
      success: false,
      attempts: MAX_RECONNECT_ATTEMPTS,
      finalState: disconnectedState,
    };
  })();

  return { promise, cancel };
}
