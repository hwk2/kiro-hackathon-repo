/**
 * Protocol version validation for incoming BLE messages.
 *
 * When a device receives a message with an unrecognized protocol_version,
 * it responds with an error message containing the expected and received
 * versions. This module provides helpers for validating the version field
 * and building the appropriate error response.
 *
 * Usage:
 *   import { validateProtocolVersion, validateIncomingMessage } from './bleVersionValidator';
 *
 *   const result = validateProtocolVersion(message);
 *   if (!result.valid && result.errorMessage) {
 *     await transport.send(serializeMessage(result.errorMessage));
 *   }
 */

import {
  PROTOCOL_VERSION,
  createErrorMessage,
  deserializeMessage,
  type ProtocolMessage,
  type ErrorPayload,
} from './bleProtocol';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of protocol version validation. */
export interface VersionValidationResult {
  valid: boolean;
  receivedVersion: string;
  expectedVersion: string;
  /** If invalid, the error message to send back. */
  errorMessage?: ProtocolMessage<ErrorPayload>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate the protocol version of an incoming message.
 *
 * @param message The deserialized protocol message.
 * @returns A VersionValidationResult. If invalid, includes the error message to send back.
 */
export function validateProtocolVersion(message: ProtocolMessage): VersionValidationResult {
  const receivedVersion = message.protocol_version;

  if (receivedVersion === PROTOCOL_VERSION) {
    return {
      valid: true,
      receivedVersion,
      expectedVersion: PROTOCOL_VERSION,
    };
  }

  return {
    valid: false,
    receivedVersion,
    expectedVersion: PROTOCOL_VERSION,
    errorMessage: buildVersionMismatchError(receivedVersion),
  };
}

/**
 * Validate raw incoming bytes for protocol version.
 * Deserializes the message and checks the version.
 *
 * @param data Raw bytes from the transport.
 * @returns VersionValidationResult, or null if the data is not valid JSON/protocol.
 */
export function validateIncomingMessage(data: Uint8Array): VersionValidationResult | null {
  const json = new TextDecoder().decode(data);
  const message = deserializeMessage(json);

  if (!message) {
    return null;
  }

  return validateProtocolVersion(message);
}

/**
 * Build the error payload for an unsupported protocol version.
 *
 * @param receivedVersion The version string that was received.
 * @returns A ProtocolMessage with an error payload describing the version mismatch.
 */
export function buildVersionMismatchError(receivedVersion: string): ProtocolMessage<ErrorPayload> {
  return createErrorMessage({
    error_code: 'unsupported_protocol_version',
    message: `Expected protocol version ${PROTOCOL_VERSION}, received ${receivedVersion}`,
    expected_version: PROTOCOL_VERSION,
    received_version: receivedVersion,
  });
}
