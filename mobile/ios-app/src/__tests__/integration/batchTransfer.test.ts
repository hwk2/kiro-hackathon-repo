/**
 * Integration tests for sequential batch transfer of 8-12 images.
 *
 * Validates that `transferImageBatch` correctly handles realistic batch
 * sizes (the capture guide recommends 8-12 images), tracks progress
 * accurately, handles mixed success/failure scenarios, and produces
 * well-formed protocol messages for each image in the batch.
 *
 * The BLE transport's `send()` is mocked to avoid native Bluetooth I/O.
 * `buildImageTransferMessage` is mocked to avoid real encryption overhead
 * in large batch tests while still verifying protocol structure.
 */

import nacl from 'tweetnacl';
import {
  transferImageBatch,
  type TransferProgress,
  type BatchTransferOptions,
} from '../../utils/bleTransferManager';
import type { BluetoothTransport, TransportStatus } from '../../utils/bleTransport';
import type { CapturedImage } from '../../../App';

// ---------------------------------------------------------------------------
// Mock buildImageTransferMessage — return unique payloads per image
// ---------------------------------------------------------------------------

jest.mock('../../utils/bleImageTransfer', () => ({
  buildImageTransferMessage: jest.fn(
    (opts: {
      imageIndex: number;
      totalImages: number;
      imageData: Uint8Array;
    }) => {
      // Produce a unique checksum per image by hashing the first few bytes
      const dataSnippet = Array.from(opts.imageData.slice(0, 8))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return {
        protocol_version: '1.0',
        message_type: 'image_transfer',
        timestamp: new Date().toISOString(),
        payload: {
          image_index: opts.imageIndex,
          total_images: opts.totalImages,
          data_base64: `encrypted-data-${opts.imageIndex}-${dataSnippet}`,
          checksum_sha256: `checksum-${opts.imageIndex}-${dataSnippet}`,
          filename: `photo_${opts.imageIndex}.jpg`,
          format: 'jpeg',
          width: 1920,
          height: 1080,
          captured_at: '2025-01-15T10:30:00Z',
          file_size_bytes: 1024,
        },
      };
    },
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock BluetoothTransport. */
function createMockTransport(
  overrides?: Partial<BluetoothTransport>,
): BluetoothTransport {
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
    fileSize: 1024 + index * 100,
    capturedAt: '2025-01-15T10:30:00Z',
  };
}

/** Build unique image data for each image (different byte patterns). */
function makeUniqueImageData(index: number, length = 128): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = (index * 37 + i) % 256;
  }
  return data;
}

/** Build BatchTransferOptions for N images with unique data per image. */
function makeBatchOptions(
  count: number,
  overrides?: Partial<BatchTransferOptions>,
): BatchTransferOptions {
  const images = Array.from({ length: count }, (_, i) => makeCapturedImage(i));
  const imageDataArray = Array.from({ length: count }, (_, i) =>
    makeUniqueImageData(i),
  );
  return {
    images,
    imageDataArray,
    sharedKey: nacl.randomBytes(32),
    transport: createMockTransport(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Batch size tests
// ---------------------------------------------------------------------------

describe('Batch transfer — batch sizes', () => {
  it('transfers exactly 8 images (minimum recommended) — all succeed', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(8, { transport });

    const result = await transferImageBatch(opts);

    expect(result.totalImages).toBe(8);
    expect(result.successCount).toBe(8);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(8);
    expect(transport.send).toHaveBeenCalledTimes(8);
    result.results.forEach((r, i) => {
      expect(r.imageIndex).toBe(i);
      expect(r.success).toBe(true);
    });
  });

  it('transfers 12 images (maximum recommended) — all succeed', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(12, { transport });

    const result = await transferImageBatch(opts);

    expect(result.totalImages).toBe(12);
    expect(result.successCount).toBe(12);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(12);
    expect(transport.send).toHaveBeenCalledTimes(12);
    result.results.forEach((r, i) => {
      expect(r.imageIndex).toBe(i);
      expect(r.success).toBe(true);
    });
  });

  it('transfers 4 images (minimum required) — all succeed', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(4, { transport });

    const result = await transferImageBatch(opts);

    expect(result.totalImages).toBe(4);
    expect(result.successCount).toBe(4);
    expect(result.failedCount).toBe(0);
    expect(result.results).toHaveLength(4);
    expect(transport.send).toHaveBeenCalledTimes(4);
  });

  it('each image produces a unique payload (different data per image)', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(8, { transport });

    await transferImageBatch(opts);

    // Collect all sent payloads
    const sentPayloads = (transport.send as jest.Mock).mock.calls.map(
      (call: [Uint8Array]) => new TextDecoder().decode(call[0]),
    );

    // Each payload should be unique (different image data → different content)
    const uniquePayloads = new Set(sentPayloads);
    expect(uniquePayloads.size).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

describe('Batch transfer — progress tracking', () => {
  it('fires 2× per image (sending + sent) for a batch of 8', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(8, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    // 8 images × 2 updates each = 16 progress calls
    expect(progressUpdates).toHaveLength(16);

    // Verify alternating sending/sent pattern
    for (let i = 0; i < 8; i++) {
      const sendingUpdate = progressUpdates[i * 2];
      const sentUpdate = progressUpdates[i * 2 + 1];
      expect(sendingUpdate.currentImageStatus).toBe('sending');
      expect(sentUpdate.currentImageStatus).toBe('sent');
    }
  });

  it('overallProgress increases monotonically from 0 to 1', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(8, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    // Verify monotonic increase (non-decreasing)
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].overallProgress).toBeGreaterThanOrEqual(
        progressUpdates[i - 1].overallProgress,
      );
    }

    // First update should be 0, last should be 1
    expect(progressUpdates[0].overallProgress).toBe(0);
    expect(
      progressUpdates[progressUpdates.length - 1].overallProgress,
    ).toBe(1);
  });

  it('final progress update has complete: true', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(8, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    // All updates except the last should be incomplete
    for (let i = 0; i < progressUpdates.length - 1; i++) {
      expect(progressUpdates[i].complete).toBe(false);
    }

    // Last update should be complete
    expect(progressUpdates[progressUpdates.length - 1].complete).toBe(true);
  });

  it('currentImageIndex increments correctly through the batch', async () => {
    const progressUpdates: TransferProgress[] = [];
    const opts = makeBatchOptions(8, {
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    await transferImageBatch(opts);

    // Each image gets 2 updates (sending + sent), both with the same index
    for (let i = 0; i < 8; i++) {
      expect(progressUpdates[i * 2].currentImageIndex).toBe(i);
      expect(progressUpdates[i * 2 + 1].currentImageIndex).toBe(i);
    }
  });
});

// ---------------------------------------------------------------------------
// Mixed success/failure in batch
// ---------------------------------------------------------------------------

describe('Batch transfer — mixed success/failure', () => {
  it('batch of 10 where images 3 and 7 fail — 8 succeed, 2 fail', async () => {
    const sendMock = jest.fn().mockImplementation(async (_data: Uint8Array) => {
      const callIndex = sendMock.mock.calls.length - 1;
      // Images at index 3 and 7 fail (0-based)
      return callIndex !== 3 && callIndex !== 7;
    });

    const transport = createMockTransport({ send: sendMock });
    const opts = makeBatchOptions(10, { transport });

    const result = await transferImageBatch(opts);

    expect(result.totalImages).toBe(10);
    expect(result.successCount).toBe(8);
    expect(result.failedCount).toBe(2);
    expect(result.results[3].success).toBe(false);
    expect(result.results[7].success).toBe(false);

    // All other images should succeed
    for (let i = 0; i < 10; i++) {
      if (i !== 3 && i !== 7) {
        expect(result.results[i].success).toBe(true);
      }
    }
  });

  it('failed images do not block subsequent images', async () => {
    const sendMock = jest.fn().mockImplementation(async () => {
      const callIndex = sendMock.mock.calls.length - 1;
      // First image fails
      return callIndex !== 0;
    });

    const transport = createMockTransport({ send: sendMock });
    const opts = makeBatchOptions(10, { transport });

    const result = await transferImageBatch(opts);

    // All 10 images should have been attempted
    expect(transport.send).toHaveBeenCalledTimes(10);

    // Image 0 failed, images 1-9 succeeded
    expect(result.results[0].success).toBe(false);
    for (let i = 1; i < 10; i++) {
      expect(result.results[i].success).toBe(true);
    }
  });

  it('batch result has correct successCount and failedCount', async () => {
    const sendMock = jest.fn().mockImplementation(async () => {
      const callIndex = sendMock.mock.calls.length - 1;
      // Images 2, 5, 8 fail
      return callIndex !== 2 && callIndex !== 5 && callIndex !== 8;
    });

    const transport = createMockTransport({ send: sendMock });
    const opts = makeBatchOptions(10, { transport });

    const result = await transferImageBatch(opts);

    expect(result.successCount).toBe(7);
    expect(result.failedCount).toBe(3);
    expect(result.successCount + result.failedCount).toBe(result.totalImages);
  });
});

// ---------------------------------------------------------------------------
// Protocol message verification
// ---------------------------------------------------------------------------

describe('Batch transfer — protocol message verification', () => {
  it('each image transfer message has the correct image_index and total_images', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(8, { transport });

    await transferImageBatch(opts);

    for (let i = 0; i < 8; i++) {
      const sentBytes = (transport.send as jest.Mock).mock.calls[i][0] as Uint8Array;
      const json = new TextDecoder().decode(sentBytes);
      const parsed = JSON.parse(json);

      expect(parsed.payload.image_index).toBe(i);
      expect(parsed.payload.total_images).toBe(8);
    }
  });

  it('each message has a unique checksum_sha256 (different image data)', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(8, { transport });

    await transferImageBatch(opts);

    const checksums = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const sentBytes = (transport.send as jest.Mock).mock.calls[i][0] as Uint8Array;
      const json = new TextDecoder().decode(sentBytes);
      const parsed = JSON.parse(json);
      checksums.add(parsed.payload.checksum_sha256);
    }

    // All 8 checksums should be unique
    expect(checksums.size).toBe(8);
  });

  it('each message data_base64 is encrypted (not raw base64 of original data)', async () => {
    const transport = createMockTransport();
    const opts = makeBatchOptions(8, { transport });

    await transferImageBatch(opts);

    for (let i = 0; i < 8; i++) {
      const sentBytes = (transport.send as jest.Mock).mock.calls[i][0] as Uint8Array;
      const json = new TextDecoder().decode(sentBytes);
      const parsed = JSON.parse(json);

      // The mock produces "encrypted-data-{index}-..." which is not raw base64
      // of the original image data. In real usage, encryptToBase64 would produce
      // ciphertext. Here we verify the field exists and is a non-empty string.
      expect(typeof parsed.payload.data_base64).toBe('string');
      expect(parsed.payload.data_base64.length).toBeGreaterThan(0);

      // Verify it's not just the raw image bytes encoded as base64
      // (the mock prefixes with "encrypted-data-" to distinguish from raw)
      expect(parsed.payload.data_base64).toContain('encrypted-data-');
    }
  });
});
