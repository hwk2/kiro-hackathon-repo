/**
 * WebSocket-based transport for web environments.
 *
 * Implements the same BluetoothTransport interface from bleTransport.ts so
 * the rest of the app doesn't need to know whether it's using BLE or
 * WebSocket underneath. Used on web where BLE is not available.
 *
 * Connects to the desktop app's WebSocket server (default ws://localhost:8765).
 *
 * Usage:
 *   import { createWebSocketTransport } from './webSocketTransport';
 *
 *   const transport = createWebSocketTransport();
 *   await transport.connect('ws://localhost:8765');
 *   await transport.send(imageBytes);
 *   transport.onData((data) => handleAck(data));
 */

import type { BluetoothTransport, TransportStatus } from './bleTransport';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default WebSocket port for the desktop app. */
export const DEFAULT_WS_PORT = 8765;

/** Default WebSocket URL for the desktop app. */
export const DEFAULT_WS_URL = `ws://localhost:${DEFAULT_WS_PORT}`;

// ---------------------------------------------------------------------------
// WebSocket transport implementation
// ---------------------------------------------------------------------------

/**
 * Create a WebSocket-based transport for web environments.
 * Implements the same BluetoothTransport interface so the rest of the
 * app doesn't need to know whether it's using BLE or WebSocket.
 *
 * @param url Optional WebSocket URL. Defaults to ws://localhost:8765.
 * @returns A BluetoothTransport backed by WebSocket.
 */
export function createWebSocketTransport(url?: string): BluetoothTransport {
  const wsUrl = url ?? DEFAULT_WS_URL;

  let currentStatus: TransportStatus = 'disconnected';
  let socket: WebSocket | null = null;

  const dataCallbacks: Array<(data: Uint8Array) => void> = [];
  const statusCallbacks: Array<(status: TransportStatus) => void> = [];

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  function setStatus(newStatus: TransportStatus): void {
    currentStatus = newStatus;
    for (const cb of statusCallbacks) {
      cb(newStatus);
    }
  }

  // -----------------------------------------------------------------------
  // Transport implementation
  // -----------------------------------------------------------------------

  const transport: BluetoothTransport = {
    get status(): TransportStatus {
      return currentStatus;
    },

    async connect(_deviceId?: string): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        try {
          setStatus('connecting');

          socket = new WebSocket(wsUrl);
          socket.binaryType = 'arraybuffer';

          socket.onopen = () => {
            setStatus('connected');
            resolve(true);
          };

          socket.onerror = () => {
            setStatus('error');
            resolve(false);
          };

          socket.onclose = () => {
            if (currentStatus === 'connecting') {
              // Connection was never established
              setStatus('error');
              resolve(false);
            } else {
              setStatus('disconnected');
            }
            socket = null;
          };

          socket.onmessage = (event: MessageEvent) => {
            let data: Uint8Array;
            if (event.data instanceof ArrayBuffer) {
              data = new Uint8Array(event.data);
            } else if (typeof event.data === 'string') {
              // Convert string to Uint8Array
              const encoder = new TextEncoder();
              data = encoder.encode(event.data);
            } else {
              return;
            }

            for (const cb of dataCallbacks) {
              cb(data);
            }
          };
        } catch {
          setStatus('error');
          resolve(false);
        }
      });
    },

    async disconnect(): Promise<void> {
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;
        socket.close();
        socket = null;
      }
      setStatus('disconnected');
    },

    async send(data: Uint8Array): Promise<boolean> {
      if (currentStatus !== 'connected' || !socket) {
        return false;
      }

      try {
        socket.send(data);
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
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;
        socket.close();
        socket = null;
      }

      dataCallbacks.length = 0;
      statusCallbacks.length = 0;
      currentStatus = 'disconnected';
    },
  };

  return transport;
}
