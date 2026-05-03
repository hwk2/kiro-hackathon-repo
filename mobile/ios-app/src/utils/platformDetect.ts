/**
 * Platform detection utilities.
 *
 * Simple helpers to determine the current runtime platform.
 * Used to conditionally switch between BLE (native) and WebSocket (web)
 * transports.
 */

import { Platform } from 'react-native';

/**
 * Returns true when running in a web browser environment.
 */
export function isWeb(): boolean {
  return Platform.OS === 'web';
}

/**
 * Returns true when running on a native mobile platform (iOS or Android).
 */
export function isNative(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
