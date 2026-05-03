import { Alert } from 'react-native';
import {
  buildFailureMessage,
  showReconnectFailureNotification,
  FAILURE_TITLE,
  type FailureNotificationOptions,
} from '../utils/bleReconnectNotification';
import { createConnectionState } from '../utils/bleConnectionManager';
import type { ReconnectResult } from '../utils/bleAutoReconnect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEVICE_NAME = 'Office Desktop';

/** Build a successful ReconnectResult. */
function successResult(attempts = 1): ReconnectResult {
  return {
    success: true,
    attempts,
    finalState: createConnectionState('connected', 'dev-1', DEVICE_NAME),
  };
}

/** Build a failed ReconnectResult. */
function failureResult(attempts = 3): ReconnectResult {
  return {
    success: false,
    attempts,
    finalState: createConnectionState('disconnected', 'dev-1', DEVICE_NAME),
  };
}

// ---------------------------------------------------------------------------
// buildFailureMessage
// ---------------------------------------------------------------------------

describe('buildFailureMessage', () => {
  it('returns correct message with device name and attempt count', () => {
    const msg = buildFailureMessage('Office Desktop', 3);
    expect(msg).toBe('Could not reconnect to Office Desktop after 3 attempts.');
  });

  it('handles different device names and attempt counts', () => {
    const msg = buildFailureMessage('Living Room PC', 1);
    expect(msg).toBe('Could not reconnect to Living Room PC after 1 attempts.');
  });
});

// ---------------------------------------------------------------------------
// showReconnectFailureNotification
// ---------------------------------------------------------------------------

describe('showReconnectFailureNotification', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('is a no-op when result.success is true', () => {
    const options: FailureNotificationOptions = { onRePair: jest.fn() };

    showReconnectFailureNotification(successResult(), DEVICE_NAME, options);

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows Alert when result.success is false', () => {
    const options: FailureNotificationOptions = { onRePair: jest.fn() };

    showReconnectFailureNotification(failureResult(), DEVICE_NAME, options);

    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('shows Alert with correct title and message', () => {
    const options: FailureNotificationOptions = { onRePair: jest.fn() };
    const result = failureResult(3);

    showReconnectFailureNotification(result, DEVICE_NAME, options);

    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe(FAILURE_TITLE);
    expect(message).toBe('Could not reconnect to Office Desktop after 3 attempts.');
  });

  it('shows Alert with Dismiss and Re-pair buttons', () => {
    const options: FailureNotificationOptions = { onRePair: jest.fn() };

    showReconnectFailureNotification(failureResult(), DEVICE_NAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toBe('Dismiss');
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].text).toBe('Re-pair');
  });

  it('Re-pair button calls onRePair', () => {
    const onRePair = jest.fn();
    const options: FailureNotificationOptions = { onRePair };

    showReconnectFailureNotification(failureResult(), DEVICE_NAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    const rePairButton = buttons.find((b: { text: string }) => b.text === 'Re-pair');
    rePairButton.onPress();

    expect(onRePair).toHaveBeenCalledTimes(1);
  });

  it('Dismiss button calls onDismiss when provided', () => {
    const onDismiss = jest.fn();
    const options: FailureNotificationOptions = { onRePair: jest.fn(), onDismiss };

    showReconnectFailureNotification(failureResult(), DEVICE_NAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    const dismissButton = buttons.find((b: { text: string }) => b.text === 'Dismiss');
    dismissButton.onPress();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
