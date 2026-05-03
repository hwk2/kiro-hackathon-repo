import {
  parseTransferAck,
  verifyAck,
  waitForAck,
  type AckResult,
} from '../utils/bleAckHandler';
import type { BluetoothTransport } from '../utils/bleTransport';
import { PROTOCOL_VERSION, serializeMessage, createTransferAckMessage } from '../utils/bleProtocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a string as UTF-8 bytes. */
function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Build valid transfer_ack bytes for a given image index and checksum. */
function makeAckBytes(
  imageIndex: number,
  checksum: string,
  status: 'ok' | 'checksum_mismatch' = 'ok',
): Uint8Array {
  const msg = createTransferAckMessage({
    image_index: imageIndex,
    received_checksum_sha256: checksum,
    status,
  });
  return toBytes(serializeMessage(msg));
}

/** Create a minimal mock BluetoothTransport for testing waitForAck. */
function createMockTransport(): BluetoothTransport & {
  /** Simulate incoming data from the desktop. */
  simulateData: (data: Uint8Array) => void;
} {
  const dataCallbacks: Array<(data: Uint8Array) => void> = [];

  return {
    status: 'connected' as const,
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
    onData(callback: (data: Uint8Array) => void): void {
      dataCallbacks.push(callback);
    },
    onStatusChange: jest.fn(),
    destroy: jest.fn(),
    simulateData(data: Uint8Array): void {
      for (const cb of dataCallbacks) {
        cb(data);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// parseTransferAck
// ---------------------------------------------------------------------------

describe('parseTransferAck', () => {
  it('parses valid transfer_ack JSON bytes', () => {
    const data = makeAckBytes(2, 'abc123', 'ok');
    const result = parseTransferAck(data);

    expect(result).not.toBeNull();
    expect(result!.imageIndex).toBe(2);
    expect(result!.receivedChecksum).toBe('abc123');
    expect(result!.status).toBe('ok');
    expect(result!.checksumMatch).toBe(true);
  });

  it('parses a checksum_mismatch ack correctly', () => {
    const data = makeAckBytes(0, 'deadbeef', 'checksum_mismatch');
    const result = parseTransferAck(data);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('checksum_mismatch');
    expect(result!.checksumMatch).toBe(false);
  });

  it('returns null for non-transfer_ack messages', () => {
    const json = JSON.stringify({
      protocol_version: PROTOCOL_VERSION,
      message_type: 'image_transfer',
      timestamp: new Date().toISOString(),
      payload: { image_index: 0 },
    });
    const result = parseTransferAck(toBytes(json));
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const result = parseTransferAck(toBytes('not valid json {{{'));
    expect(result).toBeNull();
  });

  it('returns null for empty bytes', () => {
    const result = parseTransferAck(new Uint8Array(0));
    expect(result).toBeNull();
  });

  it('returns null when payload is missing required fields', () => {
    const json = JSON.stringify({
      protocol_version: PROTOCOL_VERSION,
      message_type: 'transfer_ack',
      timestamp: new Date().toISOString(),
      payload: { image_index: 0 },
    });
    const result = parseTransferAck(toBytes(json));
    expect(result).toBeNull();
  });

  it('returns null when status is not a valid value', () => {
    const json = JSON.stringify({
      protocol_version: PROTOCOL_VERSION,
      message_type: 'transfer_ack',
      timestamp: new Date().toISOString(),
      payload: {
        image_index: 0,
        received_checksum_sha256: 'abc',
        status: 'unknown_status',
      },
    });
    const result = parseTransferAck(toBytes(json));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyAck
// ---------------------------------------------------------------------------

describe('verifyAck', () => {
  it('returns true when status is ok and checksums match', () => {
    const ack: AckResult = {
      imageIndex: 0,
      checksumMatch: true,
      status: 'ok',
      receivedChecksum: 'abc123',
    };
    expect(verifyAck(ack, 'abc123')).toBe(true);
  });

  it('returns false when status is checksum_mismatch', () => {
    const ack: AckResult = {
      imageIndex: 0,
      checksumMatch: false,
      status: 'checksum_mismatch',
      receivedChecksum: 'wrong',
    };
    expect(verifyAck(ack, 'abc123')).toBe(false);
  });

  it('returns false when checksums do not match even if status is ok', () => {
    const ack: AckResult = {
      imageIndex: 0,
      checksumMatch: true,
      status: 'ok',
      receivedChecksum: 'different_checksum',
    };
    expect(verifyAck(ack, 'expected_checksum')).toBe(false);
  });

  it('returns false when status is checksum_mismatch even if checksums happen to match', () => {
    const ack: AckResult = {
      imageIndex: 0,
      checksumMatch: false,
      status: 'checksum_mismatch',
      receivedChecksum: 'abc123',
    };
    expect(verifyAck(ack, 'abc123')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// waitForAck
// ---------------------------------------------------------------------------

describe('waitForAck', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the ack when received for the correct image index', async () => {
    const transport = createMockTransport();
    const promise = waitForAck(transport, 0, 5000);

    // Simulate the desktop sending an ack for image 0.
    transport.simulateData(makeAckBytes(0, 'checksum_abc', 'ok'));

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.imageIndex).toBe(0);
    expect(result!.receivedChecksum).toBe('checksum_abc');
    expect(result!.status).toBe('ok');
  });

  it('returns null on timeout', async () => {
    const transport = createMockTransport();
    const promise = waitForAck(transport, 0, 1000);

    // Advance time past the timeout without sending any data.
    jest.advanceTimersByTime(1001);

    const result = await promise;
    expect(result).toBeNull();
  });

  it('ignores acks for different image indices', async () => {
    const transport = createMockTransport();
    const promise = waitForAck(transport, 3, 5000);

    // Send acks for indices 0, 1, 2 — none should resolve the promise.
    transport.simulateData(makeAckBytes(0, 'checksum_0', 'ok'));
    transport.simulateData(makeAckBytes(1, 'checksum_1', 'ok'));
    transport.simulateData(makeAckBytes(2, 'checksum_2', 'ok'));

    // Now send the matching ack for index 3.
    transport.simulateData(makeAckBytes(3, 'checksum_3', 'ok'));

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.imageIndex).toBe(3);
    expect(result!.receivedChecksum).toBe('checksum_3');
  });

  it('ignores non-ack messages', async () => {
    const transport = createMockTransport();
    const promise = waitForAck(transport, 0, 5000);

    // Send a non-ack message (image_transfer type).
    const nonAckJson = JSON.stringify({
      protocol_version: PROTOCOL_VERSION,
      message_type: 'image_transfer',
      timestamp: new Date().toISOString(),
      payload: { image_index: 0 },
    });
    transport.simulateData(toBytes(nonAckJson));

    // Now send the real ack.
    transport.simulateData(makeAckBytes(0, 'real_checksum', 'ok'));

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.receivedChecksum).toBe('real_checksum');
  });

  it('resolves with checksum_mismatch ack', async () => {
    const transport = createMockTransport();
    const promise = waitForAck(transport, 1, 5000);

    transport.simulateData(makeAckBytes(1, 'bad_checksum', 'checksum_mismatch'));

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.status).toBe('checksum_mismatch');
    expect(result!.checksumMatch).toBe(false);
  });
});
