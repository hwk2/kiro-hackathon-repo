import {
  attemptReconnect,
  createCancelableReconnect,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_INTERVAL_MS,
  type ReconnectResult,
} from '../utils/bleAutoReconnect';
import type { ConnectionState } from '../utils/bleConnectionManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEVICE_ID = 'test-device-001';
const DEVICE_NAME = 'Office Desktop';

/** Build a connectFn that fails `failCount` times then succeeds. */
function buildConnectFn(failCount: number) {
  let calls = 0;
  const fn = jest.fn(async (_id: string): Promise<boolean> => {
    calls++;
    return calls > failCount;
  });
  return fn;
}

/** Build a connectFn that always fails. */
function alwaysFail() {
  return jest.fn(async (_id: string): Promise<boolean> => false);
}

// ---------------------------------------------------------------------------
// attemptReconnect
// ---------------------------------------------------------------------------

describe('attemptReconnect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('succeeds on the first attempt', async () => {
    const connectFn = buildConnectFn(0); // succeeds immediately
    const onStateChange = jest.fn();

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.finalState.status).toBe('connected');
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it('succeeds on the second attempt after first failure', async () => {
    const connectFn = buildConnectFn(1); // fails once, then succeeds
    const onStateChange = jest.fn();

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);

    // First attempt fails → timer starts for the delay
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.finalState.status).toBe('connected');
    expect(connectFn).toHaveBeenCalledTimes(2);
  });

  it('returns failure after all 3 attempts fail', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);

    // Advance through the two inter-attempt delays (no delay after the last attempt).
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(MAX_RECONNECT_ATTEMPTS);
    expect(result.finalState.status).toBe('disconnected');
    expect(connectFn).toHaveBeenCalledTimes(3);
  });

  it('calls onStateChange with correct states at each step', async () => {
    const connectFn = buildConnectFn(1); // fails once, succeeds on second
    const states: ConnectionState[] = [];
    const onStateChange = jest.fn((s: ConnectionState) => states.push(s));

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    await resultPromise;

    // Expected sequence: reconnecting(1), reconnecting(2), connected
    expect(states).toHaveLength(3);
    expect(states[0].status).toBe('reconnecting');
    expect(states[0].reconnectAttempts).toBe(1);
    expect(states[1].status).toBe('reconnecting');
    expect(states[1].reconnectAttempts).toBe(2);
    expect(states[2].status).toBe('connected');
  });

  it('waits RECONNECT_INTERVAL_MS between attempts', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();

    const resultPromise = attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);

    // After first attempt, connectFn called once. Timer not yet advanced.
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Advance just under the interval — second attempt should not have fired.
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS - 1);
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Advance the remaining 1 ms — second attempt fires.
    await jest.advanceTimersByTimeAsync(1);
    expect(connectFn).toHaveBeenCalledTimes(2);

    // Advance for the third attempt.
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await resultPromise;

    expect(connectFn).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
  });

  it('calls connectFn with the correct deviceId', async () => {
    const connectFn = buildConnectFn(0);
    const onStateChange = jest.fn();

    await attemptReconnect(DEVICE_ID, DEVICE_NAME, connectFn, onStateChange);

    expect(connectFn).toHaveBeenCalledWith(DEVICE_ID);
  });
});

// ---------------------------------------------------------------------------
// createCancelableReconnect
// ---------------------------------------------------------------------------

describe('createCancelableReconnect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('behaves like attemptReconnect when not canceled', async () => {
    const connectFn = buildConnectFn(1);
    const onStateChange = jest.fn();

    const { promise } = createCancelableReconnect(
      DEVICE_ID,
      DEVICE_NAME,
      connectFn,
      onStateChange,
    );

    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('cancel aborts the reconnect loop', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();

    const { promise, cancel } = createCancelableReconnect(
      DEVICE_ID,
      DEVICE_NAME,
      connectFn,
      onStateChange,
    );

    // Let the first attempt fail, then cancel during the wait.
    // First attempt runs synchronously after the microtask.
    // We need to let the first connectFn resolve.
    await jest.advanceTimersByTimeAsync(0);
    expect(connectFn).toHaveBeenCalledTimes(1);

    cancel();

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.finalState.status).toBe('disconnected');
    // Should not have attempted a second connection.
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it('cancel during a wait period resolves with failure', async () => {
    const connectFn = alwaysFail();
    const onStateChange = jest.fn();

    const { promise, cancel } = createCancelableReconnect(
      DEVICE_ID,
      DEVICE_NAME,
      connectFn,
      onStateChange,
    );

    // Let first attempt complete.
    await jest.advanceTimersByTimeAsync(0);
    expect(connectFn).toHaveBeenCalledTimes(1);

    // Advance partway through the wait period, then cancel.
    await jest.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS / 2);
    cancel();

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.finalState.status).toBe('disconnected');
  });

  it('returns connected state when reconnect succeeds before cancel', async () => {
    const connectFn = buildConnectFn(0); // succeeds immediately
    const onStateChange = jest.fn();

    const { promise } = createCancelableReconnect(
      DEVICE_ID,
      DEVICE_NAME,
      connectFn,
      onStateChange,
    );

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.finalState.status).toBe('connected');
  });
});
