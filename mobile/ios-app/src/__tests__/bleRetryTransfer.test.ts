import {
  transferWithRetry,
  MAX_RETRIES,
  type RetryTransferOptions,
  type RetryStatusCallback,
} from '../utils/bleRetryTransfer';
import type { BluetoothTransport } from '../utils/bleTransport';
import type { CapturedImage } from '../../App';
import * as bleImageTransfer from '../utils/bleImageTransfer';
import * as bleAckHandler from '../utils/bleAckHandler';
import type { AckResult } from '../utils/bleAckHandler';
import type { ProtocolMessage, ImageTransferPayload } from '../utils/bleProtocol';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../utils/bleImageTransfer', () => ({
  buildImageTransferMessage: jest.fn(),
  computeChecksum: jest.fn(),
}));

jest.mock('../utils/bleAckHandler', () => ({
  waitForAck: jest.fn(),
  verifyAck: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockBuildImageTransferMessage =
  bleImageTransfer.buildImageTransferMessage as jest.MockedFunction<
    typeof bleImageTransfer.buildImageTransferMessage
  >;

const mockComputeChecksum =
  bleImageTransfer.computeChecksum as jest.MockedFunction<
    typeof bleImageTransfer.computeChecksum
  >;

const mockWaitForAck = bleAckHandler.waitForAck as jest.MockedFunction<
  typeof bleAckHandler.waitForAck
>;

const mockVerifyAck = bleAckHandler.verifyAck as jest.MockedFunction<
  typeof bleAckHandler.verifyAck
>;

/** A minimal CapturedImage for testing. */
const testImage: CapturedImage = {
  uri: 'file:///test/photo.jpg',
  width: 1920,
  height: 1080,
  fileName: 'photo.jpg',
  fileSize: 1024,
  capturedAt: '2025-01-15T10:30:00Z',
};

/** Dummy image data. */
const testImageData = new Uint8Array([1, 2, 3, 4]);

/** Dummy shared key (32 bytes). */
const testSharedKey = new Uint8Array(32);

/** A fake protocol message returned by buildImageTransferMessage. */
const fakeProtocolMessage: ProtocolMessage<ImageTransferPayload> = {
  protocol_version: '1.0',
  message_type: 'image_transfer',
  timestamp: '2025-01-15T10:30:00Z',
  payload: {
    image_index: 0,
    total_images: 1,
    filename: 'photo.jpg',
    format: 'jpeg',
    width: 1920,
    height: 1080,
    captured_at: '2025-01-15T10:30:00Z',
    file_size_bytes: 1024,
    checksum_sha256: 'abc123',
    data_base64: 'AQIDBA==',
  },
};

/** A successful ack result. */
const okAck: AckResult = {
  imageIndex: 0,
  checksumMatch: true,
  status: 'ok',
  receivedChecksum: 'abc123',
};

/** A checksum mismatch ack result. */
const mismatchAck: AckResult = {
  imageIndex: 0,
  checksumMatch: false,
  status: 'checksum_mismatch',
  receivedChecksum: 'wrong_checksum',
};

/** Create a mock BluetoothTransport. */
function createMockTransport(): BluetoothTransport {
  return {
    status: 'connected' as const,
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(true),
    onData: jest.fn(),
    onStatusChange: jest.fn(),
    destroy: jest.fn(),
  };
}

/** Build default options for transferWithRetry. */
function makeOptions(
  overrides?: Partial<RetryTransferOptions>,
): RetryTransferOptions {
  return {
    image: testImage,
    imageData: testImageData,
    sharedKey: testSharedKey,
    imageIndex: 0,
    totalImages: 1,
    transport: createMockTransport(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockComputeChecksum.mockReturnValue('abc123');
  mockBuildImageTransferMessage.mockReturnValue(fakeProtocolMessage);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('transferWithRetry', () => {
  it('succeeds on first attempt when ack is ok and checksum matches', async () => {
    mockWaitForAck.mockResolvedValue(okAck);
    mockVerifyAck.mockReturnValue(true);

    const opts = makeOptions();
    const result = await transferWithRetry(opts);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.checksumVerified).toBe(true);
    expect(result.imageIndex).toBe(0);
    expect(result.error).toBeUndefined();

    // Should have built the message and sent once.
    expect(mockBuildImageTransferMessage).toHaveBeenCalledTimes(1);
    expect(opts.transport.send).toHaveBeenCalledTimes(1);
    expect(mockWaitForAck).toHaveBeenCalledTimes(1);
  });

  it('retries on checksum mismatch, then succeeds on second attempt', async () => {
    // First attempt: mismatch. Second attempt: ok.
    mockWaitForAck
      .mockResolvedValueOnce(mismatchAck)
      .mockResolvedValueOnce(okAck);
    mockVerifyAck.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const opts = makeOptions();
    const result = await transferWithRetry(opts);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.checksumVerified).toBe(true);
    expect(result.error).toBeUndefined();

    // Should have built and sent twice.
    expect(mockBuildImageTransferMessage).toHaveBeenCalledTimes(2);
    expect(opts.transport.send).toHaveBeenCalledTimes(2);
    expect(mockWaitForAck).toHaveBeenCalledTimes(2);
  });

  it('exhausts all retries (3 total attempts) and fails', async () => {
    // All 3 attempts return checksum mismatch.
    mockWaitForAck.mockResolvedValue(mismatchAck);
    mockVerifyAck.mockReturnValue(false);

    const opts = makeOptions();
    const result = await transferWithRetry(opts);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3); // 1 initial + 2 retries
    expect(result.checksumVerified).toBe(false);
    expect(result.error).toContain('Checksum mismatch');

    // Should have attempted 3 times.
    expect(mockBuildImageTransferMessage).toHaveBeenCalledTimes(3);
    expect(opts.transport.send).toHaveBeenCalledTimes(3);
    expect(mockWaitForAck).toHaveBeenCalledTimes(3);
  });

  it('fails immediately on timeout (waitForAck returns null) without retry', async () => {
    mockWaitForAck.mockResolvedValue(null);

    const opts = makeOptions();
    const result = await transferWithRetry(opts);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.checksumVerified).toBe(false);
    expect(result.error).toContain('Timed out');

    // Should only have tried once — no retry on timeout.
    expect(mockBuildImageTransferMessage).toHaveBeenCalledTimes(1);
    expect(opts.transport.send).toHaveBeenCalledTimes(1);
    expect(mockWaitForAck).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry callback with correct attempt numbers', async () => {
    // All attempts fail with checksum mismatch.
    mockWaitForAck.mockResolvedValue(mismatchAck);
    mockVerifyAck.mockReturnValue(false);

    const onRetry = jest.fn();
    const opts = makeOptions({ onRetry, imageIndex: 2 });
    await transferWithRetry(opts);

    // onRetry should be called for retry 1 and retry 2 (not the initial attempt).
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 2, 1, MAX_RETRIES);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 2, MAX_RETRIES);
  });

  it('fails immediately when transport.send() returns false without retry', async () => {
    const transport = createMockTransport();
    (transport.send as jest.Mock).mockResolvedValue(false);

    const opts = makeOptions({ transport });
    const result = await transferWithRetry(opts);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.checksumVerified).toBe(false);
    expect(result.error).toContain('transport.send()');

    // No ack wait should happen.
    expect(mockWaitForAck).not.toHaveBeenCalled();
  });

  it('fails immediately when transport.send() throws without retry', async () => {
    const transport = createMockTransport();
    (transport.send as jest.Mock).mockRejectedValue(
      new Error('BLE disconnected'),
    );

    const opts = makeOptions({ transport });
    const result = await transferWithRetry(opts);

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.checksumVerified).toBe(false);
    expect(result.error).toBe('BLE disconnected');

    expect(mockWaitForAck).not.toHaveBeenCalled();
  });

  it('passes custom ackTimeoutMs to waitForAck', async () => {
    mockWaitForAck.mockResolvedValue(okAck);
    mockVerifyAck.mockReturnValue(true);

    const opts = makeOptions({ ackTimeoutMs: 5000 });
    await transferWithRetry(opts);

    expect(mockWaitForAck).toHaveBeenCalledWith(
      opts.transport,
      0,
      5000,
    );
  });

  it('does not call onRetry on the first attempt', async () => {
    mockWaitForAck.mockResolvedValue(okAck);
    mockVerifyAck.mockReturnValue(true);

    const onRetry = jest.fn();
    const opts = makeOptions({ onRetry });
    await transferWithRetry(opts);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('MAX_RETRIES is 2', () => {
    expect(MAX_RETRIES).toBe(2);
  });
});
