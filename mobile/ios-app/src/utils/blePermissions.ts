/**
 * BLE permission and state utilities for iOS.
 *
 * On iOS, creating a BleManager instance triggers the CBCentralManager
 * authorization prompt if Bluetooth permission hasn't been granted yet.
 * This module wraps that behavior into a clean check/request API.
 *
 * Note: react-native-ble-plx requires a development build — it does NOT
 * work in Expo Go.
 */

import { BleManager, State, type Subscription } from 'react-native-ble-plx';

/** Possible outcomes when checking BLE availability. */
export type BlePermissionStatus =
  | 'ready'
  | 'powered_off'
  | 'unauthorized'
  | 'unsupported'
  | 'unknown'
  | 'resetting';

/** Result returned by BLE permission check/request functions. */
export interface BlePermissionResult {
  /** Whether BLE is available and ready to use (state is PoweredOn). */
  available: boolean;
  /** Simplified status describing the current BLE state. */
  status: BlePermissionStatus;
  /** The raw react-native-ble-plx State value. */
  rawState: State;
  /** Human-readable message explaining the current state. */
  message: string;
}

/** Maps a raw react-native-ble-plx State to our simplified status. */
function mapStateToStatus(state: State): BlePermissionStatus {
  switch (state) {
    case State.PoweredOn:
      return 'ready';
    case State.PoweredOff:
      return 'powered_off';
    case State.Unauthorized:
      return 'unauthorized';
    case State.Unsupported:
      return 'unsupported';
    case State.Resetting:
      return 'resetting';
    case State.Unknown:
    default:
      return 'unknown';
  }
}

/** Returns a user-friendly message for each BLE state. */
function messageForState(state: State): string {
  switch (state) {
    case State.PoweredOn:
      return 'Bluetooth is ready.';
    case State.PoweredOff:
      return 'Bluetooth is turned off. Please enable Bluetooth in Settings.';
    case State.Unauthorized:
      return 'Bluetooth permission was denied. Please allow Bluetooth access in Settings.';
    case State.Unsupported:
      return 'This device does not support Bluetooth Low Energy.';
    case State.Resetting:
      return 'Bluetooth is resetting. Please wait a moment and try again.';
    case State.Unknown:
    default:
      return 'Bluetooth state is unknown. Please wait a moment and try again.';
  }
}

/** Builds a BlePermissionResult from a raw State value. */
export function buildPermissionResult(state: State): BlePermissionResult {
  return {
    available: state === State.PoweredOn,
    status: mapStateToStatus(state),
    rawState: state,
    message: messageForState(state),
  };
}

/**
 * Check the current Bluetooth permission and power state.
 *
 * This reads the current state from an existing BleManager instance.
 * If no manager is provided, a new one is created — which on iOS will
 * trigger the system Bluetooth permission dialog if not yet authorized.
 */
export async function checkBlePermission(
  manager?: BleManager,
): Promise<BlePermissionResult> {
  const mgr = manager ?? new BleManager();
  const state = await mgr.state();
  return buildPermissionResult(state);
}

/**
 * Request Bluetooth permissions and wait for a definitive state.
 *
 * On iOS, instantiating BleManager triggers the CBCentralManager
 * authorization prompt. This function creates a manager (if needed),
 * then waits for the state to settle to something other than Unknown
 * (up to `timeoutMs` milliseconds).
 *
 * @param manager  Optional existing BleManager instance.
 * @param timeoutMs  Maximum time to wait for a definitive state (default 10 000 ms).
 * @returns The resolved BLE permission result.
 */
export async function requestBlePermission(
  manager?: BleManager,
  timeoutMs: number = 10_000,
): Promise<BlePermissionResult> {
  // Creating BleManager triggers the iOS permission dialog.
  const mgr = manager ?? new BleManager();

  // Check current state first — it may already be definitive.
  const currentState = await mgr.state();
  if (currentState !== State.Unknown) {
    return buildPermissionResult(currentState);
  }

  // State is Unknown — wait for it to resolve.
  return new Promise<BlePermissionResult>((resolve) => {
    let settled = false;
    let subscription: Subscription | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (state: State) => {
      if (settled) return;
      settled = true;
      if (subscription) subscription.remove();
      if (timer) clearTimeout(timer);
      resolve(buildPermissionResult(state));
    };

    subscription = mgr.onStateChange((newState) => {
      if (newState !== State.Unknown) {
        settle(newState);
      }
    }, false);

    timer = setTimeout(() => {
      // Timed out — resolve with whatever the current state is.
      mgr.state().then((s) => settle(s));
    }, timeoutMs);
  });
}
