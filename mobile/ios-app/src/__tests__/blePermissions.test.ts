import { State } from 'react-native-ble-plx';
import {
  buildPermissionResult,
  checkBlePermission,
  requestBlePermission,
  type BlePermissionStatus,
} from '../utils/blePermissions';

// ---------------------------------------------------------------------------
// Mock react-native-ble-plx
// ---------------------------------------------------------------------------

const mockState = jest.fn<Promise<State>, []>();
const mockOnStateChange = jest.fn();
const mockDestroy = jest.fn();

jest.mock('react-native-ble-plx', () => {
  const actualState = {
    Unknown: 'Unknown',
    Resetting: 'Resetting',
    Unsupported: 'Unsupported',
    Unauthorized: 'Unauthorized',
    PoweredOff: 'PoweredOff',
    PoweredOn: 'PoweredOn',
  };

  return {
    State: actualState,
    BleManager: jest.fn().mockImplementation(() => ({
      state: mockState,
      onStateChange: mockOnStateChange,
      destroy: mockDestroy,
    })),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// buildPermissionResult
// ---------------------------------------------------------------------------

describe('buildPermissionResult', () => {
  it('returns available: true for PoweredOn', () => {
    const result = buildPermissionResult(State.PoweredOn);
    expect(result.available).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.rawState).toBe(State.PoweredOn);
    expect(result.message).toContain('ready');
  });

  it.each<[State, BlePermissionStatus, boolean]>([
    [State.PoweredOff, 'powered_off', false],
    [State.Unauthorized, 'unauthorized', false],
    [State.Unsupported, 'unsupported', false],
    [State.Unknown, 'unknown', false],
    [State.Resetting, 'resetting', false],
  ])('maps %s → status "%s", available %s', (state, expectedStatus, expectedAvailable) => {
    const result = buildPermissionResult(state);
    expect(result.status).toBe(expectedStatus);
    expect(result.available).toBe(expectedAvailable);
    expect(result.rawState).toBe(state);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('includes a user-friendly message for PoweredOff', () => {
    const result = buildPermissionResult(State.PoweredOff);
    expect(result.message).toMatch(/bluetooth.*off/i);
  });

  it('includes a user-friendly message for Unauthorized', () => {
    const result = buildPermissionResult(State.Unauthorized);
    expect(result.message).toMatch(/permission.*denied/i);
  });

  it('includes a user-friendly message for Unsupported', () => {
    const result = buildPermissionResult(State.Unsupported);
    expect(result.message).toMatch(/not support/i);
  });
});

// ---------------------------------------------------------------------------
// checkBlePermission
// ---------------------------------------------------------------------------

describe('checkBlePermission', () => {
  it('returns ready when state is PoweredOn', async () => {
    mockState.mockResolvedValue(State.PoweredOn);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await checkBlePermission(manager);
    expect(result.available).toBe(true);
    expect(result.status).toBe('ready');
    expect(mockState).toHaveBeenCalledTimes(1);
  });

  it('returns powered_off when Bluetooth is off', async () => {
    mockState.mockResolvedValue(State.PoweredOff);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await checkBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('powered_off');
  });

  it('returns unauthorized when permission is denied', async () => {
    mockState.mockResolvedValue(State.Unauthorized);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await checkBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('unauthorized');
  });

  it('returns unsupported when BLE is not available', async () => {
    mockState.mockResolvedValue(State.Unsupported);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await checkBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('unsupported');
  });

  it('returns unknown when state is Unknown', async () => {
    mockState.mockResolvedValue(State.Unknown);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await checkBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('unknown');
  });

  it('returns resetting when BLE stack is resetting', async () => {
    mockState.mockResolvedValue(State.Resetting);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await checkBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('resetting');
  });

  it('creates a new BleManager when none is provided', async () => {
    mockState.mockResolvedValue(State.PoweredOn);
    const { BleManager } = require('react-native-ble-plx');
    BleManager.mockClear();

    await checkBlePermission();
    expect(BleManager).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// requestBlePermission
// ---------------------------------------------------------------------------

describe('requestBlePermission', () => {
  it('resolves immediately when state is already definitive (PoweredOn)', async () => {
    mockState.mockResolvedValue(State.PoweredOn);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await requestBlePermission(manager);
    expect(result.available).toBe(true);
    expect(result.status).toBe('ready');
    expect(mockOnStateChange).not.toHaveBeenCalled();
  });

  it('resolves immediately for Unauthorized (definitive state)', async () => {
    mockState.mockResolvedValue(State.Unauthorized);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await requestBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('unauthorized');
    expect(mockOnStateChange).not.toHaveBeenCalled();
  });

  it('resolves immediately for PoweredOff (definitive state)', async () => {
    mockState.mockResolvedValue(State.PoweredOff);
    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await requestBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('powered_off');
    expect(mockOnStateChange).not.toHaveBeenCalled();
  });

  it('waits for state change when initial state is Unknown', async () => {
    mockState.mockResolvedValue(State.Unknown);
    const mockRemove = jest.fn();
    mockOnStateChange.mockImplementation((listener: (state: State) => void) => {
      // Simulate the state changing to PoweredOn synchronously after subscription.
      Promise.resolve().then(() => listener(State.PoweredOn));
      return { remove: mockRemove };
    });

    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await requestBlePermission(manager);
    expect(result.available).toBe(true);
    expect(result.status).toBe('ready');
    expect(mockRemove).toHaveBeenCalled();
  });

  it('resolves with PoweredOff when state changes to PoweredOff', async () => {
    mockState.mockResolvedValue(State.Unknown);
    const mockRemove = jest.fn();
    mockOnStateChange.mockImplementation((listener: (state: State) => void) => {
      Promise.resolve().then(() => listener(State.PoweredOff));
      return { remove: mockRemove };
    });

    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await requestBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('powered_off');
  });

  it('resolves with Unauthorized when state changes to Unauthorized', async () => {
    mockState.mockResolvedValue(State.Unknown);
    const mockRemove = jest.fn();
    mockOnStateChange.mockImplementation((listener: (state: State) => void) => {
      Promise.resolve().then(() => listener(State.Unauthorized));
      return { remove: mockRemove };
    });

    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await requestBlePermission(manager);
    expect(result.available).toBe(false);
    expect(result.status).toBe('unauthorized');
  });

  it('times out and resolves with current state after timeout', async () => {
    jest.useFakeTimers();

    // state() returns Unknown both initially and at timeout.
    mockState.mockImplementation(() => Promise.resolve(State.Unknown as State));
    const mockRemove = jest.fn();
    mockOnStateChange.mockImplementation(() => {
      // Never fires a state change.
      return { remove: mockRemove };
    });

    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const promise = requestBlePermission(manager, 5000);

    // Flush the initial state() promise.
    await Promise.resolve();
    await Promise.resolve();

    // Advance past the timeout.
    jest.advanceTimersByTime(5000);

    // Flush the microtask queue so the .then() in the timeout handler runs.
    await Promise.resolve();
    await Promise.resolve();

    const result = await promise;
    expect(result.status).toBe('unknown');
    expect(result.available).toBe(false);
    expect(mockRemove).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('ignores subsequent state changes after settling', async () => {
    mockState.mockResolvedValue(State.Unknown);
    let capturedListener: ((state: State) => void) | null = null;
    const mockRemove = jest.fn();
    mockOnStateChange.mockImplementation((listener: (state: State) => void) => {
      capturedListener = listener;
      // Simulate the first state change arriving shortly after subscription.
      Promise.resolve().then(() => listener(State.PoweredOn));
      return { remove: mockRemove };
    });

    const { BleManager } = require('react-native-ble-plx');
    const manager = new BleManager();

    const result = await requestBlePermission(manager);
    expect(result.status).toBe('ready');

    // Second call should be a no-op (settled flag prevents double-resolve).
    capturedListener!(State.PoweredOff);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('creates a new BleManager when none is provided', async () => {
    mockState.mockResolvedValue(State.PoweredOn);
    const { BleManager } = require('react-native-ble-plx');
    BleManager.mockClear();

    await requestBlePermission();
    expect(BleManager).toHaveBeenCalledTimes(1);
  });
});
