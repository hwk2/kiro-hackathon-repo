import {
  PROTOCOL_VERSION,
  createMessage,
  serializeMessage,
  deserializeMessage,
  isValidEnvelope,
  createImageTransferMessage,
  createTransferAckMessage,
  createErrorMessage,
  createPairingRequestMessage,
  createPairingResponseMessage,
  type MessageType,
  type ImageTransferPayload,
  type TransferAckPayload,
  type ErrorPayload,
  type PairingRequestPayload,
  type PairingResponsePayload,
} from '../utils/bleProtocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSampleImageTransferPayload(): ImageTransferPayload {
  return {
    image_index: 0,
    total_images: 6,
    filename: 'wall_north.jpg',
    format: 'jpeg',
    width: 1920,
    height: 1080,
    captured_at: '2025-01-15T10:30:00Z',
    file_size_bytes: 245760,
    checksum_sha256: 'a1b2c3d4e5f6',
    data_base64: 'c29tZWJhc2U2NA==',
  };
}

function makeSampleTransferAckPayload(): TransferAckPayload {
  return {
    image_index: 0,
    received_checksum_sha256: 'a1b2c3d4e5f6',
    status: 'ok',
  };
}

function makeSampleErrorPayload(): ErrorPayload {
  return {
    error_code: 'unsupported_protocol_version',
    message: 'Expected protocol version 1.0, received 2.0',
    expected_version: '1.0',
    received_version: '2.0',
  };
}

function makeSamplePairingRequestPayload(): PairingRequestPayload {
  return {
    device_name: 'iPhone 15 Pro',
    public_key_base64: 'cHVibGlja2V5',
  };
}

function makeSamplePairingResponsePayload(): PairingResponsePayload {
  return {
    accepted: true,
    device_name: 'Desktop-Win11',
    public_key_base64: 'ZGVza3RvcGtleQ==',
  };
}

// ---------------------------------------------------------------------------
// PROTOCOL_VERSION
// ---------------------------------------------------------------------------

describe('PROTOCOL_VERSION', () => {
  it('is "1.0"', () => {
    expect(PROTOCOL_VERSION).toBe('1.0');
  });
});

// ---------------------------------------------------------------------------
// createMessage
// ---------------------------------------------------------------------------

describe('createMessage', () => {
  it('creates an envelope with the current protocol version', () => {
    const msg = createMessage('error', { error_code: 'test', message: 'test' });
    expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
  });

  it('sets the correct message_type', () => {
    const msg = createMessage('image_transfer', {});
    expect(msg.message_type).toBe('image_transfer');
  });

  it('includes an ISO-8601 timestamp', () => {
    const before = new Date().toISOString();
    const msg = createMessage('pairing_request', {});
    const after = new Date().toISOString();

    // Timestamp should be between before and after (inclusive).
    expect(msg.timestamp >= before).toBe(true);
    expect(msg.timestamp <= after).toBe(true);
  });

  it('includes the provided payload', () => {
    const payload = { device_name: 'test', public_key_base64: 'abc' };
    const msg = createMessage('pairing_request', payload);
    expect(msg.payload).toEqual(payload);
  });

  it('works with all supported message types', () => {
    const types: MessageType[] = [
      'image_transfer',
      'pairing_request',
      'pairing_response',
      'transfer_ack',
      'error',
    ];

    for (const type of types) {
      const msg = createMessage(type, {});
      expect(msg.message_type).toBe(type);
      expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
    }
  });
});

// ---------------------------------------------------------------------------
// serializeMessage
// ---------------------------------------------------------------------------

describe('serializeMessage', () => {
  it('produces valid JSON', () => {
    const msg = createMessage('error', { error_code: 'test', message: 'oops' });
    const json = serializeMessage(msg);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('preserves all envelope fields in the JSON output', () => {
    const msg = createMessage('transfer_ack', { image_index: 0, status: 'ok' });
    const json = serializeMessage(msg);
    const parsed = JSON.parse(json);

    expect(parsed.protocol_version).toBe(PROTOCOL_VERSION);
    expect(parsed.message_type).toBe('transfer_ack');
    expect(typeof parsed.timestamp).toBe('string');
    expect(parsed.payload).toEqual({ image_index: 0, status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// deserializeMessage
// ---------------------------------------------------------------------------

describe('deserializeMessage', () => {
  it('parses valid JSON back to a ProtocolMessage', () => {
    const original = createMessage('pairing_request', {
      device_name: 'test',
      public_key_base64: 'abc',
    });
    const json = serializeMessage(original);
    const result = deserializeMessage(json);

    expect(result).not.toBeNull();
    expect(result!.protocol_version).toBe(original.protocol_version);
    expect(result!.message_type).toBe(original.message_type);
    expect(result!.timestamp).toBe(original.timestamp);
    expect(result!.payload).toEqual(original.payload);
  });

  it('returns null for invalid JSON', () => {
    expect(deserializeMessage('not json at all')).toBeNull();
    expect(deserializeMessage('{broken')).toBeNull();
    expect(deserializeMessage('')).toBeNull();
  });

  it('returns null when protocol_version is missing', () => {
    const json = JSON.stringify({
      message_type: 'error',
      timestamp: new Date().toISOString(),
      payload: {},
    });
    expect(deserializeMessage(json)).toBeNull();
  });

  it('returns null when message_type is missing', () => {
    const json = JSON.stringify({
      protocol_version: '1.0',
      timestamp: new Date().toISOString(),
      payload: {},
    });
    expect(deserializeMessage(json)).toBeNull();
  });

  it('returns null when timestamp is missing', () => {
    const json = JSON.stringify({
      protocol_version: '1.0',
      message_type: 'error',
      payload: {},
    });
    expect(deserializeMessage(json)).toBeNull();
  });

  it('returns null when payload is missing', () => {
    const json = JSON.stringify({
      protocol_version: '1.0',
      message_type: 'error',
      timestamp: new Date().toISOString(),
    });
    expect(deserializeMessage(json)).toBeNull();
  });

  it('returns null when message_type is not a recognized type', () => {
    const json = JSON.stringify({
      protocol_version: '1.0',
      message_type: 'unknown_type',
      timestamp: new Date().toISOString(),
      payload: {},
    });
    expect(deserializeMessage(json)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isValidEnvelope
// ---------------------------------------------------------------------------

describe('isValidEnvelope', () => {
  it('returns true for a valid envelope object', () => {
    const obj = {
      protocol_version: '1.0',
      message_type: 'error',
      timestamp: '2025-01-15T10:30:00Z',
      payload: {},
    };
    expect(isValidEnvelope(obj)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidEnvelope(null)).toBe(false);
  });

  it('returns false for a non-object', () => {
    expect(isValidEnvelope('string')).toBe(false);
    expect(isValidEnvelope(42)).toBe(false);
    expect(isValidEnvelope(undefined)).toBe(false);
  });

  it('returns false when protocol_version is not a string', () => {
    expect(
      isValidEnvelope({
        protocol_version: 1,
        message_type: 'error',
        timestamp: 'ts',
        payload: {},
      }),
    ).toBe(false);
  });

  it('returns false when message_type is not a recognized type', () => {
    expect(
      isValidEnvelope({
        protocol_version: '1.0',
        message_type: 'invalid',
        timestamp: 'ts',
        payload: {},
      }),
    ).toBe(false);
  });

  it('returns false when timestamp is not a string', () => {
    expect(
      isValidEnvelope({
        protocol_version: '1.0',
        message_type: 'error',
        timestamp: 12345,
        payload: {},
      }),
    ).toBe(false);
  });

  it('returns false when payload key is absent', () => {
    expect(
      isValidEnvelope({
        protocol_version: '1.0',
        message_type: 'error',
        timestamp: 'ts',
      }),
    ).toBe(false);
  });

  it('accepts payload with null value (key is present)', () => {
    expect(
      isValidEnvelope({
        protocol_version: '1.0',
        message_type: 'error',
        timestamp: 'ts',
        payload: null,
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Convenience factory functions
// ---------------------------------------------------------------------------

describe('createImageTransferMessage', () => {
  it('creates an image_transfer message with the correct type and payload', () => {
    const payload = makeSampleImageTransferPayload();
    const msg = createImageTransferMessage(payload);

    expect(msg.message_type).toBe('image_transfer');
    expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
    expect(msg.payload).toEqual(payload);
    expect(typeof msg.timestamp).toBe('string');
  });
});

describe('createTransferAckMessage', () => {
  it('creates a transfer_ack message with the correct type and payload', () => {
    const payload = makeSampleTransferAckPayload();
    const msg = createTransferAckMessage(payload);

    expect(msg.message_type).toBe('transfer_ack');
    expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
    expect(msg.payload).toEqual(payload);
  });
});

describe('createErrorMessage', () => {
  it('creates an error message with the correct type and payload', () => {
    const payload = makeSampleErrorPayload();
    const msg = createErrorMessage(payload);

    expect(msg.message_type).toBe('error');
    expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
    expect(msg.payload).toEqual(payload);
  });
});

describe('createPairingRequestMessage', () => {
  it('creates a pairing_request message with the correct type and payload', () => {
    const payload = makeSamplePairingRequestPayload();
    const msg = createPairingRequestMessage(payload);

    expect(msg.message_type).toBe('pairing_request');
    expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
    expect(msg.payload).toEqual(payload);
  });
});

describe('createPairingResponseMessage', () => {
  it('creates a pairing_response message with the correct type and payload', () => {
    const payload = makeSamplePairingResponsePayload();
    const msg = createPairingResponseMessage(payload);

    expect(msg.message_type).toBe('pairing_response');
    expect(msg.protocol_version).toBe(PROTOCOL_VERSION);
    expect(msg.payload).toEqual(payload);
  });

  it('handles pairing_response without optional public_key_base64', () => {
    const payload: PairingResponsePayload = {
      accepted: false,
      device_name: 'Desktop',
    };
    const msg = createPairingResponseMessage(payload);

    expect(msg.message_type).toBe('pairing_response');
    expect(msg.payload.accepted).toBe(false);
    expect(msg.payload.public_key_base64).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Round-trip: serialize → deserialize
// ---------------------------------------------------------------------------

describe('serialize → deserialize round-trip', () => {
  it('round-trips an image_transfer message', () => {
    const original = createImageTransferMessage(makeSampleImageTransferPayload());
    const json = serializeMessage(original);
    const restored = deserializeMessage(json);

    expect(restored).not.toBeNull();
    expect(restored!.protocol_version).toBe(original.protocol_version);
    expect(restored!.message_type).toBe(original.message_type);
    expect(restored!.timestamp).toBe(original.timestamp);
    expect(restored!.payload).toEqual(original.payload);
  });

  it('round-trips an error message with extra fields', () => {
    const original = createErrorMessage(makeSampleErrorPayload());
    const json = serializeMessage(original);
    const restored = deserializeMessage(json);

    expect(restored).not.toBeNull();
    expect((restored!.payload as Record<string, unknown>).expected_version).toBe('1.0');
    expect((restored!.payload as Record<string, unknown>).received_version).toBe('2.0');
  });
});
