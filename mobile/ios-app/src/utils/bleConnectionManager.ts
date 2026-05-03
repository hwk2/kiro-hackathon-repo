/**
 * BLE connection state management utilities.
 *
 * Provides types, factory functions, and helpers for tracking and
 * displaying the current BLE connection status in the UI. This module
 * does NOT manage actual BLE connections — it only models the state.
 *
 * Actual connection logic lives in react-native-ble-plx; auto-reconnect
 * logic is handled separately (task 5.9).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Possible connection states. */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Connection state with metadata. */
export interface ConnectionState {
  status: ConnectionStatus;
  deviceId: string | null;
  deviceName: string | null;
  /** Number of reconnect attempts made (0 when connected or disconnected). */
  reconnectAttempts: number;
  /** ISO timestamp of last status change. */
  lastUpdated: string;
}

/** Initial disconnected state. */
export const INITIAL_CONNECTION_STATE: ConnectionState = {
  status: 'disconnected',
  deviceId: null,
  deviceName: null,
  reconnectAttempts: 0,
  lastUpdated: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ConnectionState object with the given parameters.
 *
 * @param status            The connection status.
 * @param deviceId          BLE device identifier, or null.
 * @param deviceName        Human-readable device name, or null.
 * @param reconnectAttempts Number of reconnect attempts (default 0).
 * @returns A fully populated ConnectionState.
 */
export function createConnectionState(
  status: ConnectionStatus,
  deviceId: string | null = null,
  deviceName: string | null = null,
  reconnectAttempts: number = 0,
): ConnectionState {
  return {
    status,
    deviceId,
    deviceName,
    reconnectAttempts,
    lastUpdated: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/** Returns true when the connection is active. */
export function isConnected(state: ConnectionState): boolean {
  return state.status === 'connected';
}

/** Returns true when a reconnection attempt is in progress. */
export function isReconnecting(state: ConnectionState): boolean {
  return state.status === 'reconnecting';
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Status indicator colors keyed by connection status. */
const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: '#44aa44',
  connecting: '#7c8aff',
  reconnecting: '#cc8800',
  disconnected: '#cc4444',
};

/**
 * Return the hex color associated with the current connection status.
 */
export function getStatusColor(state: ConnectionState): string {
  return STATUS_COLORS[state.status];
}

/**
 * Return a user-friendly message describing the current connection status.
 */
export function getStatusMessage(state: ConnectionState): string {
  switch (state.status) {
    case 'connected':
      return `Connected to ${state.deviceName ?? 'device'}`;
    case 'connecting':
      return `Connecting to ${state.deviceName ?? 'device'}...`;
    case 'reconnecting':
      return `Reconnecting... (attempt ${state.reconnectAttempts}/3)`;
    case 'disconnected':
      return 'Not connected';
  }
}
