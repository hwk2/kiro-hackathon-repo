/**
 * Transfer acknowledgement handler for BLE image transfers.
 *
 * Processes incoming `transfer_ack` messages from the desktop, verifying
 * that the desktop received each image correctly by comparing checksums.
 *
 * Usage:
 *   import { parseTransferAck, verifyAck, waitForAck } from './bleAckHandler';
 *
 *   const ack = parseTransferAck(incomingBytes);
 *   if (ack && verifyAck(ack, expectedChecksum)) {
 *     // Image received correctly
 *   }
 *
 *   // Or wait for a specific ack from the transport:
 *   const ack = await waitForAck(transport, imageIndex, 30_000);
 */

import type { ProtocolMessage, TransferAckPayload } from './bleProtocol';
import { deserializeMessage } from './bleProtocol';
import type { BluetoothTransport } from './bleTransport';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of processing a transfer_ack. */
export interface AckResult {
  /** The image index this ack is for. */
  imageIndex: number;
  /** Whether the checksum matched. */
  checksumMatch: boolean;
  /** The status from the ack ('ok' or 'checksum_mismatch'). */
  status: 'ok' | 'checksum_mismatch';
  /** The checksum the desktop received. */
  receivedChecksum: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse raw bytes received from the transport into a transfer_ack message.
 * Returns null if the data is not valid JSON, not a valid protocol envelope,
 * or not a transfer_ack message type.
 *
 * @param data Raw bytes from the BLE transport.
 * @returns The parsed AckResult, or null if the data is not a valid transfer_ack.
 */
export function parseTransferAck(data: Uint8Array): AckResult | null {
  let json: string;
  try {
    json = new TextDecoder().decode(data);
  } catch {
    return null;
  }

  const message = deserializeMessage(json);
  if (!message) {
    return null;
  }

  if (message.message_type !== 'transfer_ack') {
    return null;
  }

  const payload = message.payload as TransferAckPayload;

  // Validate required payload fields.
  if (typeof payload.image_index !== 'number') return null;
  if (typeof payload.received_checksum_sha256 !== 'string') return null;
  if (payload.status !== 'ok' && payload.status !== 'checksum_mismatch') return null;

  return {
    imageIndex: payload.image_index,
    checksumMatch: payload.status === 'ok',
    status: payload.status,
    receivedChecksum: payload.received_checksum_sha256,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify that a transfer_ack matches the expected checksum for an image.
 *
 * Returns true only when both conditions are met:
 * 1. The ack status is 'ok'
 * 2. The received checksum matches the expected checksum
 *
 * @param ack The parsed ack result.
 * @param expectedChecksum The checksum we computed for the original image data.
 * @returns true if the ack confirms successful receipt with matching checksum.
 */
export function verifyAck(ack: AckResult, expectedChecksum: string): boolean {
  return ack.status === 'ok' && ack.receivedChecksum === expectedChecksum;
}

// ---------------------------------------------------------------------------
// Async wait
// ---------------------------------------------------------------------------

/** Default timeout for waiting for an ack (30 seconds). */
const DEFAULT_ACK_TIMEOUT_MS = 30_000;

/**
 * Wait for a transfer_ack from the transport for a specific image index.
 *
 * Registers an onData listener on the transport, waits for a matching ack
 * (by image_index), and resolves with the AckResult. Times out after
 * `timeoutMs` milliseconds and resolves with null.
 *
 * @param transport The BLE transport to listen on.
 * @param imageIndex The expected image index to match.
 * @param timeoutMs Timeout in milliseconds (default 30000).
 * @returns The AckResult for the matching image index, or null on timeout.
 */
export function waitForAck(
  transport: BluetoothTransport,
  imageIndex: number,
  timeoutMs: number = DEFAULT_ACK_TIMEOUT_MS,
): Promise<AckResult | null> {
  return new Promise<AckResult | null>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    transport.onData((data: Uint8Array) => {
      if (settled) return;

      const ack = parseTransferAck(data);
      if (ack && ack.imageIndex === imageIndex) {
        settled = true;
        clearTimeout(timer);
        resolve(ack);
      }
    });
  });
}
