/**
 * Bluetooth protocol message envelope for Mobile ↔ Desktop communication.
 *
 * All Bluetooth messages use a framed JSON envelope with a protocol version,
 * message type, ISO-8601 timestamp, and a type-specific payload. This module
 * provides types, factory functions, and serialization helpers for the
 * Room Vision AI BLE protocol (version 1.0).
 *
 * Usage:
 *   import { createImageTransferMessage, serializeMessage } from './bleProtocol';
 *
 *   const msg = createImageTransferMessage({ ... });
 *   const json = serializeMessage(msg);
 *   await transport.send(new TextEncoder().encode(json));
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current protocol version. */
export const PROTOCOL_VERSION = '1.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported message types. */
export type MessageType =
  | 'image_transfer'
  | 'pairing_request'
  | 'pairing_response'
  | 'transfer_ack'
  | 'error';

/** The protocol message envelope. */
export interface ProtocolMessage<T = unknown> {
  protocol_version: string;
  message_type: MessageType;
  timestamp: string;
  payload: T;
}

/** image_transfer payload per design spec. */
export interface ImageTransferPayload {
  image_index: number;
  total_images: number;
  filename: string;
  format: string;
  width: number;
  height: number;
  captured_at: string;
  file_size_bytes: number;
  checksum_sha256: string;
  data_base64: string;
}

/** transfer_ack payload per design spec. */
export interface TransferAckPayload {
  image_index: number;
  received_checksum_sha256: string;
  status: 'ok' | 'checksum_mismatch';
}

/** error payload per design spec. */
export interface ErrorPayload {
  error_code: string;
  message: string;
  [key: string]: unknown;
}

/** pairing_request payload. */
export interface PairingRequestPayload {
  device_name: string;
  public_key_base64: string;
}

/** pairing_response payload. */
export interface PairingResponsePayload {
  accepted: boolean;
  device_name: string;
  public_key_base64?: string;
}

// ---------------------------------------------------------------------------
// Valid message types set (for runtime validation)
// ---------------------------------------------------------------------------

const VALID_MESSAGE_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'image_transfer',
  'pairing_request',
  'pairing_response',
  'transfer_ack',
  'error',
]);

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Create a protocol message envelope with the current version and timestamp.
 *
 * @param type    The message type.
 * @param payload The type-specific payload.
 * @returns A fully formed ProtocolMessage.
 */
export function createMessage<T>(type: MessageType, payload: T): ProtocolMessage<T> {
  return {
    protocol_version: PROTOCOL_VERSION,
    message_type: type,
    timestamp: new Date().toISOString(),
    payload,
  };
}

/**
 * Serialize a protocol message to a JSON string.
 *
 * @param message The protocol message to serialize.
 * @returns The JSON string representation.
 */
export function serializeMessage(message: ProtocolMessage): string {
  return JSON.stringify(message);
}

/**
 * Deserialize a JSON string into a ProtocolMessage.
 * Returns null if the string is not valid JSON or does not have the
 * required envelope fields.
 *
 * @param json The JSON string to parse.
 * @returns The parsed ProtocolMessage, or null on failure.
 */
export function deserializeMessage(json: string): ProtocolMessage | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (isValidEnvelope(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Type guard that checks whether an unknown value has the required
 * protocol envelope fields (protocol_version, message_type, timestamp,
 * payload).
 */
export function isValidEnvelope(obj: unknown): obj is ProtocolMessage {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const record = obj as Record<string, unknown>;

  if (typeof record.protocol_version !== 'string') return false;
  if (typeof record.message_type !== 'string') return false;
  if (!VALID_MESSAGE_TYPES.has(record.message_type)) return false;
  if (typeof record.timestamp !== 'string') return false;
  if (!('payload' in record)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Convenience factory functions
// ---------------------------------------------------------------------------

/**
 * Create an image_transfer message.
 */
export function createImageTransferMessage(
  payload: ImageTransferPayload,
): ProtocolMessage<ImageTransferPayload> {
  return createMessage('image_transfer', payload);
}

/**
 * Create a transfer_ack message.
 */
export function createTransferAckMessage(
  payload: TransferAckPayload,
): ProtocolMessage<TransferAckPayload> {
  return createMessage('transfer_ack', payload);
}

/**
 * Create an error message.
 */
export function createErrorMessage(
  payload: ErrorPayload,
): ProtocolMessage<ErrorPayload> {
  return createMessage('error', payload);
}

/**
 * Create a pairing_request message.
 */
export function createPairingRequestMessage(
  payload: PairingRequestPayload,
): ProtocolMessage<PairingRequestPayload> {
  return createMessage('pairing_request', payload);
}

/**
 * Create a pairing_response message.
 */
export function createPairingResponseMessage(
  payload: PairingResponsePayload,
): ProtocolMessage<PairingResponsePayload> {
  return createMessage('pairing_response', payload);
}
