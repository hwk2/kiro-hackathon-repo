/**
 * Integration tests: auto-reconnect on Bluetooth connection loss.
 *
 * Validates requirements:
 * - 3.7: "IF the Bluetooth connection is lost, THEN THE Mobile_App SHALL
 *   attempt to reconnect automatically up to 3 times at 5-second intervals."
 * - 3.8: "IF automatic reconnection fails after 3 attempts, THEN THE
 *   Mobile_App SHALL notify the user and provide an option to re-initiate
 *   pairing."
 *
 * Uses real implementations of attemptReconnect, createCancelableReconnect,
 * createConnectionState, and showReconnectFailureNotification. Only
 * Alert.alert is mocked (native I/O boundary).
 */

import { Alert } from 'react-native';
import {
  attemptReconnect,
  createCancelableReconnect,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_INTERVAL_MS,
} from '../../utils/bleAutoReconnect';
import {
  createConnectionState,
  type ConnectionState,
} from '../../utils/bleConnectionManager';
import {
  showReconnectFailureNotification,
  FAILURE_TITLE,
} from '../../utils/bleReconnectNotification';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_ID = 'integration-device-001';
const DEVICE_NAME = 'Test Desktop';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a connectFn that fails `failCount` times then succeeds. */
function buildConnectFn(failCount: number) {
  let calls = 0;
  return jest.fn(async (_id: string): Promise<boolean> => {
    calls++;
    return calls > failCount;
  });
}

/** Build a connectFn that always fails. */
function alwaysFail() {
  return jest.fn(async (_id: string): Promise<boolean> => false);
}

// ---------------------------------------------------------------------------
// Reconnect success scenarios
// ---------------------------------------------------------------------------

describe('Auto-reconnect integration — success scenarios', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('connection lost → succeeds on 1st attempt → disconnected → reconnecting(1) → connected', async () => {
    const connectFn = buildConnectFn(0);
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const result = await attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);

    // State transitions: reconnecting(1) → connected
    expect(states).toHaveLength(2);
    expect(states[0].status).toBe('reconnecting');
    expect(states[0].reconnectAttempts).toBe(1);
    expect(states[0].deviceId).toBe(DEVICE_ID);
    expect(states[0].deviceName).toBe(DEVICE_NAME);
    expect(states[1].status).toBe('connected');
    expect(states[1].reconnectAttempts).toBe(0);
  });

  it('connection lost → fails 1st, succeeds 2nd → reconnecting(1) → reconnecting(2) → connected', async () => {
    const connectFn = buildConnectFn(1);
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);

    // State transitions: reconnecting(1) → reconnecting(2) → connected
    expect(states).toHaveLength(3);
    expect(states[0].status).toBe('reconnecting');
    expect(states[0].reconnectAttempts).toBe(1);
    expect(states[1].status).toBe('reconnecting');
    expect(states[1].reconnectAttempts).toBe(2);
    expect(states[2].status).toBe('connected');
    expect(states[2].reconnectAttempts).toBe(0);
  });

  it('connection lost → fails 1st and 2nd, succeeds 3rd → transitions through all 3 attempts', async () => {
    const connectFn = buildConnectFn(2);
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);

    // State transitions: reconnecting(1) → reconnecting(2) → reconnecting(3) → connected
    expect(states).toHaveLength(4);
    expect(states[0].status).toBe('reconnecting');
    expect(states[0].reconnectAttempts).toBe(1);
    expect(states[1].status).toBe('reconnecting');
    expect(states[1].reconnectAttempts).toBe(2);
    expect(states[2].status).toBe('reconnecting');
    expect(states[2].reconnectAttempts).toBe(3);
    expect(states[3].status).toBe('connected');
    expect(states[3].reconnectAttempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reconnect failure scenarios (integrated with notification)
// ---------------------------------------------------------------------------

describe('Auto-reconnect integration — failure with notification', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  it('all 3 attempts fail → state ends disconnected → failure notification shown', async () => {
    const connectFn = alwaysFail();
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await resultPromise;

    // Verify reconnect failed
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(MAX_RECONNECT_ATTEMPTS);

    // Final state is disconnected
    const lastState = states[states.length - 1];
    expect(lastState.status).toBe('disconnected');

    // Trigger the notification (as the app would after reconnect failure)
    const onRePair = jest.fn();
    showReconnectFailureNotification(result, DEVICE_NAME, { onRePair });

    // Alert was shown with correct title and message
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe(FAILURE_TITLE);
    expect(message).toContain(DEVICE_NAME);
    expect(message).toContain('3');
  });

  it('all 3 attempts fail → notification has "Re-pair" option', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await resultPromise;

    const onRePair = jest.fn();
    showReconnectFailureNotification(result, DEVICE_NAME, { onRePair });

    const buttons = alertSpy.mock.calls[0][2];
    expect(buttons).toHaveLength(2);

    const rePairButton = buttons.find((b: { text: string }) => b.text === 'Re-pair');
    expect(rePairButton).toBeDefined();

    // Tapping Re-pair invokes the callback
    rePairButton.onPress();
    expect(onRePair).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// State transition verification
// ---------------------------------------------------------------------------

describe('Auto-reconnect integration — state transitions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('onStateChange receives correct ConnectionState objects at each step', async () => {
    const connectFn = alwaysFail();
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await resultPromise;

    // 3 reconnecting states + 1 final disconnected = 4 total
    expect(states).toHaveLength(4);

    // Each state is a real ConnectionState with all fields
    for (const state of states) {
      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('deviceId', DEVICE_ID);
      expect(state).toHaveProperty('deviceName', DEVICE_NAME);
      expect(state).toHaveProperty('reconnectAttempts');
      expect(state).toHaveProperty('lastUpdated');
      expect(typeof state.lastUpdated).toBe('string');
    }
  });

  it('reconnectAttempts increments correctly (1, 2, 3)', async () => {
    const connectFn = alwaysFail();
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await resultPromise;

    // First 3 states are reconnecting with incrementing attempts
    expect(states[0].reconnectAttempts).toBe(1);
    expect(states[1].reconnectAttempts).toBe(2);
    expect(states[2].reconnectAttempts).toBe(3);
  });

  it('final state after success has reconnectAttempts: 0', async () => {
    const connectFn = buildConnectFn(1);
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.finalState.reconnectAttempts).toBe(0);

    // The last state emitted via callback also has 0
    const lastState = states[states.length - 1];
    expect(lastState.status).toBe('connected');
    expect(lastState.reconnectAttempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Timing verification
// ---------------------------------------------------------------------------

describe('Auto-reconnect integration — timing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reconnect waits 5 seconds between attempts', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);

    // After first attempt, only 1 call
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Advance 4999ms — still only 1 call
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS - 1);
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Advance the remaining 1ms — second attempt fires
    await jest.advanceTimersByTimeAsync(1);
    expect(connectFn).toHaveBeenCalledTimes(2);

    // Advance another full interval — third attempt fires
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await resultPromise;

    expect(connectFn).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
  });

  it('total time for 3 failed attempts is ~10 seconds (2 intervals between 3 attempts)', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();
    let resolved = false;

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    resultPromise.then(() => { resolved = true; });

    // After 9999ms (just under 2 full intervals), should not be resolved
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS * 2 - 1);
    expect(resolved).toBe(false);
    // 2 attempts completed, 3rd not yet started
    expect(connectFn).toHaveBeenCalledTimes(2);

    // Advance the final 1ms — third attempt fires and completes (no delay after last)
    await jest.advanceTimersByTimeAsync(1);
    await resultPromise;

    expect(connectFn).toHaveBeenCalledTimes(3);
    expect(resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cancelable reconnect integration
// ---------------------------------------------------------------------------

describe('Auto-reconnect integration — cancelable reconnect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('cancel during reconnect → state immediately goes to disconnected', async () => {
    const connectFn = alwaysFail();
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const { promise, cancel } = createCancelableReconnect(
      DEVICE_ID,
      DEVICE_NAME,
      connectFn,
      onStateChange,
    );

    // Let first attempt complete
    await jest.advanceTimersByTimeAsync(0);
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Cancel during the wait period
    cancel();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.finalState.status).toBe('disconnected');

    // Last emitted state should be disconnected
    const lastState = states[states.length - 1];
    expect(lastState.status).toBe('disconnected');
  });

  it('cancel during wait period → no further attempts made', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();

    const { promise, cancel } = createCancelableReconnect(
      DEVICE_ID,
      DEVICE_NAME,
      connectFn,
      onStateChange,
    );

    // Let first attempt complete
    await jest.advanceTimersByTimeAsync(0);
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Advance partway through the wait, then cancel
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS / 2);
    cancel();

    const result = await promise;

    // Only 1 attempt was made — no further attempts after cancel
    expect(connectFn).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);

    // Advance well past when attempt 2 and 3 would have fired — still only 1 call
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS * 3);
    expect(connectFn).toHaveBeenCalledTimes(1);
  });
});
