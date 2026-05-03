import nacl from 'tweetnacl';
import {
  calculateOverallProgress,
  transferImageBatch,
  type TransferProgress,
  type BatchTransferOptions,
} from '../utils/bleTransferManager';
import type { BluetoothTransport, TransportStatus } from '../utils/bleTransport';
import type { CapturedImage } from '../../App';

// ---------------------------------------------------------------------------
// Mock buildImageTransferMessage — avoid real encryption in unit tests
// ---------------------------------------------------------------------------

jest.mock('../utils/bleImageTransfer', () => ({
  buildImageTransferMessage: jest.fn((opts: { imageIndex: number; totalImages: number }) => ({
    protocol_version: '1.0',
    message_type: 'image_transfer',
    timestamp: '2025-01-15T10:30:00Z',
    payload: {
      image_index: opts.imageIndex,
      total_images: opts.totalImages,
      data_base64: 'bW9ja2VkLWRhdGE=',
      checksum_sha256: 'abc123',
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock BluetoothTransport. */
function createMockTransport(overrides?: Partial<BluetoothTransport>): BluetoothTransport {
  return {
    status: 'connected' as TransportStatus,
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(true),
    onData: jest.fn(),
    onStatusChange: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  };
}

/** Build a sample CapturedImage. */
function makeCapturedImage(index: number): CapturedImage {
  return {
    uri: `file:///tmp/photo_${index}.jpg`,
    width: 1920,
    height: 1080,
    fileName: `photo_${index}.jpg`,
    fileSize: 1024,
    capturedAt: '2025-01-15T10:30:00Z',
  };
}

/** Build sample image bytes. */
function makeImageData(length = 64): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = i % 256;
  }
  return data;
}

/** Build default BatchTransferOptions for N images. */
function makeBatchOptions(
  count: number,
  overrides?: Partial<BatchTransferOptions>,
): BatchTransferOptions {
  const images = Array.from({ length: count }, (_, i) => makeCapturedImage(i));
  const imageDataArray = Array.from({ length: count }, () => makeImageData());
  return {
    images,
    imageDataArray,
    sharedKey: nacl.randomBytes(32),
    transport: createMockTransport(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateOverallProgress
// ---------------------------------------------------------------------------

describe('calculateOverallProgress', () => {
  it('returns 0 at the start of a batch (index 0, not sent)', () => {
    expect(calculateOverallProgress(0, 4, false)).toBe(0);
  });

  it('returns 0.25 after the first of 4 images is sent', () => {
    expect(calculateOverallProgress(0, 4, true)).toBe(0.25);
  });

  it('returns 0.5 when 2 of 4 images are sent', () => {
    expect(calculateOverallProgress(1, 4, true)).toBe(0.5);
  });

  it('returns 1 when the last image is sent', () => {
    expect(calculateOverallProgress(3, 4, true)).toBe(1);
  });

  it('returns 0.75 when 3 of 4 are done and 4th is sending', () => {
    expect(calculateOverallProgress(3, 4, false)).toBe(0.75);
  });

  it('returns 1 for an empty batch (totalImages = 0)', () => {
    expect(calculateOverallProgress(0, 0, false)).toBe(1);
  });

  it('returns correct fraction for a single image batch', () => {
    expect(calculateOverallProgress(0, 1, false)).toBe(0);
    expect(calculateOverallProgress(0, 1, true)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// transferImageBatch — sequential sending
// ---------------------------------------------------------------------------

describe('transferImageBatch', () => {
  it('sends all images sequentially via transport.send()', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(3, { transport });

    const result = await transferImageBatch(opts);

    expect(transport.send).toHaveBeenCalledTimes(3);
    expect(result.totalImages).toBe(3);
    expect(result.successCount).toBe(3);
    expect(result.failedCount).toBe(0);
  });

  it('sends JSON-encoded protocol messages as Uint8Array bytes', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(1, { transport });

    await transferImageBatch(opts);

    const sentArg = (transport.send as jest.Mock).mock.calls[0][0];
    expect(sentArg).toBeInstanceOf(Uint8Array);

    // Decode and verify it's valid JSON with the expected envelope.
    const json = new TextDecoder().decode(sentArg);
    const parsed = JSON.parse(json);
    expect(parsed.protocol_version).toBe('1.0');
    expect(parsed.message_type).toBe('image_transfer');
    expect(parsed.payload.image_index).toBe(0);
  });

  it('returns correct results array with imageIndex and success', async () => {
    const opts = makeBatchOptions(2);
    const result = await transferImageBatch(opts);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ imageIndex: 0, success: true });
    expect(result.results[1]).toEqual({ imageIndex: 1, success: true });
  });
});

// ---------------------------------------------------------------------------
// transferImageBatch — progress callback
// ---------------------------------------------------------------------------

describe('transferImageBatch — progress callback', () => {
  it('calls onProgress with "sending" then "sent" for each image', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(2, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    // 2 images × 2 updates each = 4 progress calls.
    expect(progressUpdates).toHaveLength(4);

    // Image 0: sending → sent
    expect(progressUpdates[0].currentImageIndex).toBe(0);
    expect(progressUpdates[0].currentImageStatus).toBe('sending');
    expect(progressUpdates[1].currentImageIndex).toBe(0);
    expect(progressUpdates[1].currentImageStatus).toBe('sent');

    // Image 1: sending → sent
    expect(progressUpdates[2].currentImageIndex).toBe(1);
    expect(progressUpdates[2].currentImageStatus).toBe('sending');
    expect(progressUpdates[3].currentImageIndex).toBe(1);
    expect(progressUpdates[3].currentImageStatus).toBe('sent');
  });

  it('reports correct overallProgress values', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(2, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    // Image 0 sending: 0/2 = 0
    expect(progressUpdates[0].overallProgress).toBe(0);
    // Image 0 sent: 1/2 = 0.5
    expect(progressUpdates[1].overallProgress).toBe(0.5);
    // Image 1 sending: 1/2 = 0.5
    expect(progressUpdates[2].overallProgress).toBe(0.5);
    // Image 1 sent: 2/2 = 1
    expect(progressUpdates[3].overallProgress).toBe(1);
  });

  it('sets complete=true only on the last progress update', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(2, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    // All updates except the last should have complete=false.
    for (let i = 0; i < progressUpdates.length - 1; i++) {
      expect(progressUpdates[i].complete).toBe(false);
    }
    expect(progressUpdates[progressUpdates.length - 1].complete).toBe(true);
  });

  it('reports totalImages correctly in every progress update', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(3, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    for (const update of progressUpdates) {
      expect(update.totalImages).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// transferImageBatch — failure handling
// ---------------------------------------------------------------------------

describe('transferImageBatch — failure handling', () => {
  it('records failure when transport.send() returns false', async () => {
    const transport = createMockTransport({
      send: jest.fn().mockResolvedValue(false),
    });
    const opts = makeBatchOptions(2, { transport });

    const result = await transferImageBatch(opts);

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBeDefined();
    expect(result.results[1].success).toBe(false);
  });

  it('records failure when transport.send() throws an error', async () => {
    const transport = createMockTransport({
      send: jest.fn().mockRejectedValue(new Error('BLE write failed')),
    });
    const opts = makeBatchOptions(1, { transport });

    const result = await transferImageBatch(opts);

    expect(result.failedCount).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe('BLE write failed');
  });

  it('continues sending remaining images after one fails', async () => {
    const sendMock = jest
      .fn()
      .mockResolvedValueOnce(false)   // Image 0 fails
      .mockResolvedValueOnce(true)    // Image 1 succeeds
      .mockResolvedValueOnce(true);   // Image 2 succeeds

    const transport = createMockTransport({ send: sendMock });
    const opts = makeBatchOptions(3, { transport });

    const result = await transferImageBatch(opts);

    expect(transport.send).toHaveBeenCalledTimes(3);
    expect(result.successCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[1].success).toBe(true);
    expect(result.results[2].success).toBe(true);
  });

  it('reports "failed" status in progress callback for failed images', async () => {
    const progressUpdates: TransferProgress[] = [];
    const transport = createMockTransport({
      send: jest.fn().mockResolvedValue(false),
    });
    const opts = makeBatchOptions(1, {
      transport,
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    expect(progressUpdates[0].currentImageStatus).toBe('sending');
    expect(progressUpdates[1].currentImageStatus).toBe('failed');
  });

  it('has correct success/failure counts with mixed results', async () => {
    const sendMock = jest
      .fn()
      .mockResolvedValueOnce(true)    // Image 0 succeeds
      .mockResolvedValueOnce(false)   // Image 1 fails
      .mockResolvedValueOnce(true)    // Image 2 succeeds
      .mockResolvedValueOnce(false);  // Image 3 fails

    const transport = createMockTransport({ send: sendMock });
    const opts = makeBatchOptions(4, { transport });

    const result = await transferImageBatch(opts);

    expect(result.totalImages).toBe(4);
    expect(result.successCount).toBe(2);
    expect(result.failedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// transferImageBatch — empty batch
// ---------------------------------------------------------------------------

describe('transferImageBatch — empty batch', () => {
  it('returns zero counts for an empty image array', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(0, { transport });

    const result = await transferImageBatch(opts);

    expect(result.totalImages).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('does not call transport.send() for an empty batch', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(0, { transport });

    await transferImageBatch(opts);

    expect(transport.send).not.toHaveBeenCalled();
  });

  it('calls onProgress once with complete=true for an empty batch', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(0, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    expect(progressUpdates).toHaveLength(1);
    expect(progressUpdates[0].complete).toBe(true);
    expect(progressUpdates[0].overallProgress).toBe(1);
  });
});
