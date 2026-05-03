/**
 * BLE scanning utilities for discovering nearby Desktop instances.
 *
 * Uses react-native-ble-plx to scan for BLE peripherals advertising
 * the Room Vision AI service UUID. Discovered devices are deduplicated
 * by ID and mapped to a simple DiscoveredDevice interface.
 *
 * Note: react-native-ble-plx requires a development build — it does NOT
 * work in Expo Go.
 */

import { BleManager, type Device } from 'react-native-ble-plx';
import { requestBlePermission } from './blePermissions';

/**
 * The BLE service UUID advertised by the Desktop Visualization Engine.
 * This must match the UUID used by the desktop Bluetooth server.
 */
export const ROOM_VISION_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';

/** A discovered BLE device advertising the Room Vision AI service. */
export interface DiscoveredDevice {
  /** Unique device identifier (platform-specific). */
  id: string;
  /** Human-readable device name, or "Unknown Device" if unavailable. */
  name: string;
  /** Received Signal Strength Indicator in dBm, or null if unavailable. */
  rssi: number | null;
  /** ISO 8601 timestamp of when the device was first discovered. */
  discoveredAt: string;
}

/**
 * Map a raw react-native-ble-plx Device to our DiscoveredDevice interface.
 */
function mapDevice(device: Device): DiscoveredDevice {
  return {
    id: device.id,
    name: device.name ?? device.localName ?? 'Unknown Device',
    rssi: device.rssi,
    discoveredAt: new Date().toISOString(),
  };
}

/**
 * Start scanning for nearby Desktop instances advertising the Room Vision AI
 * service UUID.
 *
 * Before scanning, this function calls `requestBlePermission` to ensure BLE
 * is available. If BLE is not available, `onError` is called with the
 * permission result message and scanning does not start.
 *
 * Discovered devices are deduplicated by ID — `onDeviceFound` is only called
 * the first time a device is seen during a scan session.
 *
 * @param manager       An existing BleManager instance.
 * @param onDeviceFound Called once for each newly discovered device.
 * @param onError       Optional callback for errors (permission failures, scan errors).
 * @returns A cleanup function that stops the scan when called.
 */
export async function startScanning(
  manager: BleManager,
  onDeviceFound: (device: DiscoveredDevice) => void,
  onError?: (message: string) => void,
): Promise<() => void> {
  const permissionResult = await requestBlePermission(manager);

  if (!permissionResult.available) {
    onError?.(permissionResult.message);
    return () => {};
  }

  const seen = new Set<string>();

  manager.startDeviceScan(
    [ROOM_VISION_SERVICE_UUID],
    null,
    (error, device) => {
      if (error) {
        onError?.(error.message);
        return;
      }

      if (!device) return;

      if (seen.has(device.id)) return;
      seen.add(device.id);

      onDeviceFound(mapDevice(device));
    },
  );

  return () => {
    stopScanning(manager);
  };
}

/**
 * Stop an active BLE scan.
 *
 * Safe to call even if no scan is in progress.
 */
export function stopScanning(manager: BleManager): void {
  manager.stopDeviceScan();
}
