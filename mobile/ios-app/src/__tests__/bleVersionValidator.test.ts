import {
  validateProtocolVersion,
  validateIncomingMessage,
  buildVersionMismatchError,
} from '../utils/bleVersionValidator';
import {
  PROTOCOL_VERSION,
  createMessage,
  serializeMessage,
  type ProtocolMessage,
  type ErrorPayload,
} from '../utils/bleProtocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a string as Uint8Array (UTF-8). */
function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Build a valid protocol message with a specific version. */
function makeMessage(version: string): ProtocolMessage {
  return {
    protocol_version: version,
    message_type: 'pairing_request',
    timestamp: new Date().toISOString(),
    payload: { device_name: 'Test', public_key_base64: 'abc' },
  };
}

// ---------------------------------------------------------------------------
// validateProtocolVersion
// ---------------------------------------------------------------------------

describe('validateProtocolVersion', () => {
  it('returns valid for a message with the matching protocol version', () => {
    const message = createMessage('pairing_request', {
      device_name: 'iPhone',
      public_key_base64: 'abc',
    });

    const result = validateProtocolVersion(message);

    expect(result.valid).toBe(true);
    expect(result.receivedVersion).toBe(PROTOCOL_VERSION);
    expect(result.expectedVersion).toBe(PROTOCOL_VERSION);
    expect(result.errorMessage).toBeUndefined();
  });

  it('returns invalid for a message with a mismatched protocol version', () => {
    const message = makeMessage('2.0');

    const result = validateProtocolVersion(message);

    expect(result.valid).toBe(false);
    expect(result.receivedVersion).toBe('2.0');
    expect(result.expectedVersion).toBe(PROTOCOL_VERSION);
  });

  it('includes an error message for a mismatched protocol version', () => {
    const message = makeMessage('2.0');

    const result = validateProtocolVersion(message);

    expect(result.errorMessage).toBeDefined();
    expect(result.errorMessage!.message_type).toBe('error');
    expect(result.errorMessage!.protocol_version).toBe(PROTOCOL_VERSION);
  });

  it('error message has correct error_code, expected_version, and received_version', () => {
    const message = makeMessage('3.5');

    const result = validateProtocolVersion(message);
    const payload = result.errorMessage!.payload as ErrorPayload & Record<string, unknown>;

    expect(payload.error_code).toBe('unsupported_protocol_version');
    expect(payload.expected_version).toBe(PROTOCOL_VERSION);
    expect(payload.received_version).toBe('3.5');
    expect(payload.message).toBe(
      `Expected protocol version ${PROTOCOL_VERSION}, received 3.5`,
    );
  });
});

// ---------------------------------------------------------------------------
// validateIncomingMessage
// ---------------------------------------------------------------------------

describe('validateIncomingMessage', () => {
  it('returns a valid result for bytes containing a matching-version message', () => {
    const message = createMessage('transfer_ack', {
      image_index: 0,
      received_checksum_sha256: 'abc',
      status: 'ok',
    });
    const bytes = toBytes(serializeMessage(message));

    const result = validateIncomingMessage(bytes);

    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
    expect(result!.receivedVersion).toBe(PROTOCOL_VERSION);
  });

  it('returns null for invalid bytes (not valid JSON)', () => {
    const bytes = toBytes('this is not json');

    const result = validateIncomingMessage(bytes);

    expect(result).toBeNull();
  });

  it('returns null for bytes that are valid JSON but not a protocol message', () => {
    const bytes = toBytes(JSON.stringify({ foo: 'bar' }));

    const result = validateIncomingMessage(bytes);

    expect(result).toBeNull();
  });

  it('returns an invalid result for bytes with a wrong protocol version', () => {
    const raw = JSON.stringify({
      protocol_version: '9.9',
      message_type: 'error',
      timestamp: new Date().toISOString(),
      payload: { error_code: 'test', message: 'test' },
    });
    const bytes = toBytes(raw);

    const result = validateIncomingMessage(bytes);

    expect(result).not.toBeNull();
    expect(result!.valid).toBe(false);
    expect(result!.receivedVersion).toBe('9.9');
    expect(result!.errorMessage).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildVersionMismatchError
// ---------------------------------------------------------------------------

describe('buildVersionMismatchError', () => {
  it('creates an error message with the correct envelope fields', () => {
    const errorMsg = buildVersionMismatchError('2.0');

    expect(errorMsg.protocol_version).toBe(PROTOCOL_VERSION);
    expect(errorMsg.message_type).toBe('error');
    expect(typeof errorMsg.timestamp).toBe('string');
  });

  it('creates a payload with the correct error_code and version fields', () => {
    const errorMsg = buildVersionMismatchError('4.2');
    const payload = errorMsg.payload as ErrorPayload & Record<string, unknown>;

    expect(payload.error_code).toBe('unsupported_protocol_version');
    expect(payload.expected_version).toBe(PROTOCOL_VERSION);
    expect(payload.received_version).toBe('4.2');
    expect(payload.message).toBe(
      `Expected protocol version ${PROTOCOL_VERSION}, received 4.2`,
    );
  });

  it('uses the current PROTOCOL_VERSION as the envelope version', () => {
    const errorMsg = buildVersionMismatchError('0.1');

    // The error response itself should use the current protocol version
    expect(errorMsg.protocol_version).toBe('1.0');
  });
});
