/**
 * BLE unpair utilities.
 *
 * Handles the full unpair flow: optional confirmation dialog, clearing
 * persisted pairing data from AsyncStorage, and resetting the connection
 * state to disconnected.
 *
 * See requirement 3.9: "WHEN the user requests to unpair, THE Mobile_App
 * SHALL terminate the connection and remove stored pairing information
 * from both devices."
 */

import { Alert } from 'react-native';
import { clearPairingInfo } from './blePairingStore';
import { INITIAL_CONNECTION_STATE, type ConnectionState } from './bleConnectionManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the unpair action. */
export interface UnpairOptions {
  /** Called with the new (disconnected) connection state after unpairing. */
  onStateChange: (state: ConnectionState) => void;
  /** Optional: called after unpair is complete. */
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show a confirmation dialog, then unpair if confirmed.
 *
 * - Shows Alert: "Unpair from {deviceName}?" with Cancel/Unpair buttons
 * - On confirm: clears stored pairing info, calls onStateChange with disconnected state
 * - On cancel: no-op
 *
 * @param deviceName  Human-readable device name shown in the dialog.
 * @param options     Callbacks for state change and completion.
 */
export function confirmUnpair(
  deviceName: string,
  options: UnpairOptions,
): void {
  Alert.alert(
    `Unpair from ${deviceName}?`,
    'This will disconnect and remove the pairing data.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpair',
        style: 'destructive',
        onPress: () => {
          void executeUnpair(options);
        },
      },
    ],
  );
}

/**
 * Execute the unpair action without confirmation.
 *
 * - Clears stored pairing info from AsyncStorage
 * - Calls onStateChange with INITIAL_CONNECTION_STATE (disconnected)
 * - Calls onComplete if provided
 */
export async function executeUnpair(options: UnpairOptions): Promise<void> {
  await clearPairingInfo();
  options.onStateChange(INITIAL_CONNECTION_STATE);
  options.onComplete?.();
}
