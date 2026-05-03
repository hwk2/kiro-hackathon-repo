/**
 * Bluetooth data transport abstraction layer.
 *
 * Defines a transport-agnostic interface for sending and receiving binary
 * data over Bluetooth. The default implementation uses BLE characteristics
 * (via react-native-ble-plx) with chunked writes, serving as a fallback
 * until a native RFCOMM module is available.
 *
 * BLE has limited throughput (~1 Mbps practical), so large payloads are
 * split into MTU-sized chunks and written sequentially to a BLE
 * characteristic. The receiving side reassembles chunks via notifications
 * on a separate read characteristic.
 *
 * Usage:
 *   const transport = createBleTransport(bleManager);
 *   await transport.connect(deviceId);
 *   await transport.send(imageBytes);
 *   transport.onData((data) => handleAck(data));
 */

import {
  BleManager,
  type Characteristic,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';
import { ROOM_VISION_SERVICE_UUID } from './bleScanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Transport connection state. */
export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Abstract transport interface for sending/receiving data over Bluetooth. */
export interface BluetoothTransport {
  /** Current connection status. */
  status: TransportStatus;
  /** Connect to a device by ID. */
  connect(deviceId: string): Promise<boolean>;
  /** Disconnect from the current device. */
  disconnect(): Promise<void>;
  /** Send raw data (Uint8Array) to the connected device. */
  send(data: Uint8Array): Promise<boolean>;
  /** Register a callback for incoming data. */
  onData(callback: (data: Uint8Array) => void): void;
  /** Register a callback for connection status changes. */
  onStatusChange(callback: (status: TransportStatus) => void): void;
  /** Clean up resources. */
  destroy(): void;
}

/** Configuration for the BLE-based transport. */
export interface BleTransportConfig {
  /** The BLE service UUID to use. */
  serviceUUID: string;
  /** The BLE characteristic UUID for writing data. */
  writeCharacteristicUUID: string;
  /** The BLE characteristic UUID for reading data (notifications). */
  readCharacteristicUUID: string;
  /** Maximum chunk size in bytes for BLE writes (default 512). */
  mtuSize?: number;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/**
 * Default BLE transport configuration using the Room Vision AI service UUID
 * and dedicated read/write characteristic UUIDs.
 */
export const BLE_TRANSPORT_CONFIG: BleTransportConfig = {
  serviceUUID: ROOM_VISION_SERVICE_UUID,
  writeCharacteristicUUID: '12345678-1234-1234-1234-123456789abd',
  readCharacteristicUUID: '12345678-1234-1234-1234-123456789abe',
  mtuSize: 512,
};

// ---------------------------------------------------------------------------
// BLE transport implementation
// ---------------------------------------------------------------------------

/**
 * Create a BLE-based BluetoothTransport.
 *
 * Uses react-native-ble-plx to connect, discover services/characteristics,
 * and transfer data by chunking writes into MTU-sized pieces.
 *
 * @param manager An existing BleManager instance.
 * @param config  Optional transport configuration (defaults to BLE_TRANSPORT_CONFIG).
 * @returns A BluetoothTransport backed by BLE characteristics.
 */
export function createBleTransport(
  manager: BleManager,
  config?: BleTransportConfig,
): BluetoothTransport {
  const cfg = config ?? BLE_TRANSPORT_CONFIG;
  const mtu = cfg.mtuSize ?? 512;

  let currentStatus: TransportStatus = 'disconnected';
  let connectedDevice: Device | null = null;
  let writeCharacteristic: Characteristic | null = null;
  let readCharacteristic: Characteristic | null = null;

  const dataCallbacks: Array<(data: Uint8Array) => void> = [];
  const statusCallbacks: Array<(status: TransportStatus) => void> = [];
  const subscriptions: Subscription[] = [];

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  function setStatus(newStatus: TransportStatus): void {
    currentStatus = newStatus;
    for (const cb of statusCallbacks) {
      cb(newStatus);
    }
  }

  function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // -----------------------------------------------------------------------
  // Transport implementation
  // -----------------------------------------------------------------------

  const transport: BluetoothTransport = {
    get status(): TransportStatus {
      return currentStatus;
    },

    async connect(deviceId: string): Promise<boolean> {
      try {
        setStatus('connecting');

        // Connect to the BLE peripheral.
        const device = await manager.connectToDevice(deviceId);
        connectedDevice = device;

        // Discover all services and characteristics.
        await device.discoverAllServicesAndCharacteristics();

        // Find the target service.
        const services = await device.services();
        const targetService = services.find(
          (s) => s.uuid.toLowerCase() === cfg.serviceUUID.toLowerCase(),
        );

        if (!targetService) {
          setStatus('error');
          return false;
        }

        // Find write and read characteristics.
        const characteristics = await targetService.characteristics();

        writeCharacteristic =
          characteristics.find(
            (c) => c.uuid.toLowerCase() === cfg.writeCharacteristicUUID.toLowerCase(),
          ) ?? null;

        readCharacteristic =
          characteristics.find(
            (c) => c.uuid.toLowerCase() === cfg.readCharacteristicUUID.toLowerCase(),
          ) ?? null;

        if (!writeCharacteristic || !readCharacteristic) {
          setStatus('error');
          return false;
        }

        // Monitor the read characteristic for incoming data.
        const monitorSub = readCharacteristic.monitor(
          (error, characteristic) => {
            if (error || !characteristic?.value) return;
            const data = base64ToUint8Array(characteristic.value);
            for (const cb of dataCallbacks) {
              cb(data);
            }
          },
        );
        subscriptions.push(monitorSub);

        // Monitor device disconnection.
        const disconnectSub = manager.onDeviceDisconnected(
          deviceId,
          () => {
            connectedDevice = null;
            writeCharacteristic = null;
            readCharacteristic = null;
            setStatus('disconnected');
          },
        );
        subscriptions.push(disconnectSub);

        setStatus('connected');
        return true;
      } catch {
        setStatus('error');
        return false;
      }
    },

    async disconnect(): Promise<void> {
      if (connectedDevice) {
        try {
          await manager.cancelDeviceConnection(connectedDevice.id);
        } catch {
          // Ignore disconnect errors — device may already be disconnected.
        }
      }
      connectedDevice = null;
      writeCharacteristic = null;
      readCharacteristic = null;
      setStatus('disconnected');
    },

    async send(data: Uint8Array): Promise<boolean> {
      if (currentStatus !== 'connected' || !writeCharacteristic) {
        return false;
      }

      try {
        // Chunk the data into MTU-sized pieces and write sequentially.
        for (let offset = 0; offset < data.length; offset += mtu) {
          const chunk = data.slice(offset, offset + mtu);
          const base64Chunk = uint8ArrayToBase64(chunk);
          await writeCharacteristic.writeWithResponse(base64Chunk);
        }
        return true;
      } catch {
        return false;
      }
    },

    onData(callback: (data: Uint8Array) => void): void {
      dataCallbacks.push(callback);
    },

    onStatusChange(callback: (status: TransportStatus) => void): void {
      statusCallbacks.push(callback);
    },

    destroy(): void {
      // Remove all BLE subscriptions.
      for (const sub of subscriptions) {
        sub.remove();
      }
      subscriptions.length = 0;

      // Clear callbacks.
      dataCallbacks.length = 0;
      statusCallbacks.length = 0;

      // Disconnect if still connected.
      if (connectedDevice) {
        manager
          .cancelDeviceConnection(connectedDevice.id)
          .catch(() => {});
      }
      connectedDevice = null;
      writeCharacteristic = null;
      readCharacteristic = null;
      currentStatus = 'disconnected';
    },
  };

  return transport;
}
