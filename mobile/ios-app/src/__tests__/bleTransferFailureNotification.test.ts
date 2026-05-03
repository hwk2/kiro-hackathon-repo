import { Alert } from 'react-native';
import {
  buildTransferFailureMessage,
  showTransferFailureNotification,
  TRANSFER_FAILURE_TITLE,
  type TransferFailureOptions,
} from '../utils/bleTransferFailureNotification';
import type { RetryTransferResult } from '../utils/bleRetryTransfer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FILENAME = 'room_photo_01.jpg';

/** Build a successful RetryTransferResult. */
function successResult(attempts = 1): RetryTransferResult {
  return {
    imageIndex: 0,
    success: true,
    attempts,
    checksumVerified: true,
  };
}

/** Build a failed RetryTransferResult. */
function failureResult(attempts = 3): RetryTransferResult {
  return {
    imageIndex: 0,
    success: false,
    attempts,
    checksumVerified: false,
    error: `Checksum mismatch after ${attempts} attempts`,
  };
}

// ---------------------------------------------------------------------------
// buildTransferFailureMessage
// ---------------------------------------------------------------------------

describe('buildTransferFailureMessage', () => {
  it('returns correct message with filename and attempt count', () => {
    const msg = buildTransferFailureMessage('room_photo_01.jpg', 3);
    expect(msg).toBe('Could not transfer "room_photo_01.jpg" after 3 attempts.');
  });

  it('handles different filenames and attempt counts', () => {
    const msg = buildTransferFailureMessage('kitchen.png', 1);
    expect(msg).toBe('Could not transfer "kitchen.png" after 1 attempts.');
  });
});

// ---------------------------------------------------------------------------
// showTransferFailureNotification
// ---------------------------------------------------------------------------

describe('showTransferFailureNotification', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('is a no-op when result.success is true', () => {
    const options: TransferFailureOptions = { onRetry: jest.fn() };

    showTransferFailureNotification(successResult(), FILENAME, options);

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows Alert when result.success is false', () => {
    const options: TransferFailureOptions = { onRetry: jest.fn() };

    showTransferFailureNotification(failureResult(), FILENAME, options);

    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('shows Alert with correct title and message', () => {
    const options: TransferFailureOptions = { onRetry: jest.fn() };
    const result = failureResult(3);

    showTransferFailureNotification(result, FILENAME, options);

    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe(TRANSFER_FAILURE_TITLE);
    expect(message).toBe('Could not transfer "room_photo_01.jpg" after 3 attempts.');
  });

  it('shows Alert with Skip and Retry buttons', () => {
    const options: TransferFailureOptions = { onRetry: jest.fn() };

    showTransferFailureNotification(failureResult(), FILENAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toBe('Skip');
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].text).toBe('Retry');
  });

  it('Retry button calls onRetry', () => {
    const onRetry = jest.fn();
    const options: TransferFailureOptions = { onRetry };

    showTransferFailureNotification(failureResult(), FILENAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    const retryButton = buttons.find((b: { text: string }) => b.text === 'Retry');
    retryButton.onPress();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('Skip button calls onSkip when provided', () => {
    const onSkip = jest.fn();
    const options: TransferFailureOptions = { onRetry: jest.fn(), onSkip };

    showTransferFailureNotification(failureResult(), FILENAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    const skipButton = buttons.find((b: { text: string }) => b.text === 'Skip');
    skipButton.onPress();

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
