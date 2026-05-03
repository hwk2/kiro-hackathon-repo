import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  confirmUnpair,
  executeUnpair,
  type UnpairOptions,
} from '../utils/bleUnpair';
import { INITIAL_CONNECTION_STATE } from '../utils/bleConnectionManager';
import { PAIRING_INFO_KEY } from '../utils/blePairingStore';

// ---------------------------------------------------------------------------
// Mock AsyncStorage
// ---------------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      getItem: jest.fn(async (key: string) => {
        return store[key] ?? null;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEVICE_NAME = 'Office Desktop';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear!();
});

// ---------------------------------------------------------------------------
// confirmUnpair
// ---------------------------------------------------------------------------

describe('confirmUnpair', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows Alert with correct title including device name', () => {
    const options: UnpairOptions = { onStateChange: jest.fn() };

    confirmUnpair(DEVICE_NAME, options);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title] = alertSpy.mock.calls[0];
    expect(title).toBe(`Unpair from ${DEVICE_NAME}?`);
  });

  it('shows Alert with Cancel and Unpair buttons', () => {
    const options: UnpairOptions = { onStateChange: jest.fn() };

    confirmUnpair(DEVICE_NAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text).toBe('Cancel');
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].text).toBe('Unpair');
    expect(buttons[1].style).toBe('destructive');
  });

  it('Unpair button triggers executeUnpair flow', async () => {
    const onStateChange = jest.fn();
    const onComplete = jest.fn();
    const options: UnpairOptions = { onStateChange, onComplete };

    // Seed pairing data so we can verify it gets cleared
    await AsyncStorage.setItem(PAIRING_INFO_KEY, JSON.stringify({ deviceId: 'test' }));

    confirmUnpair(DEVICE_NAME, options);

    // Simulate pressing the Unpair button
    const buttons = alertSpy.mock.calls[0][2];
    const unpairButton = buttons.find((b: { text: string }) => b.text === 'Unpair');
    unpairButton.onPress();

    // Allow the async executeUnpair to complete
    await new Promise(process.nextTick);

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PAIRING_INFO_KEY);
    expect(onStateChange).toHaveBeenCalledWith(INITIAL_CONNECTION_STATE);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Cancel button is a no-op', () => {
    const onStateChange = jest.fn();
    const options: UnpairOptions = { onStateChange };

    confirmUnpair(DEVICE_NAME, options);

    const buttons = alertSpy.mock.calls[0][2];
    const cancelButton = buttons.find((b: { text: string }) => b.text === 'Cancel');

    // Cancel button has no onPress — pressing it does nothing
    expect(cancelButton.onPress).toBeUndefined();
    expect(onStateChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// executeUnpair
// ---------------------------------------------------------------------------

describe('executeUnpair', () => {
  it('clears pairing info from AsyncStorage', async () => {
    await AsyncStorage.setItem(PAIRING_INFO_KEY, JSON.stringify({ deviceId: 'test' }));

    const options: UnpairOptions = { onStateChange: jest.fn() };
    await executeUnpair(options);

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PAIRING_INFO_KEY);
    const stored = await AsyncStorage.getItem(PAIRING_INFO_KEY);
    expect(stored).toBeNull();
  });

  it('calls onStateChange with INITIAL_CONNECTION_STATE (disconnected)', async () => {
    const onStateChange = jest.fn();
    const options: UnpairOptions = { onStateChange };

    await executeUnpair(options);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(INITIAL_CONNECTION_STATE);
  });

  it('calls onComplete when provided', async () => {
    const onComplete = jest.fn();
    const options: UnpairOptions = { onStateChange: jest.fn(), onComplete };

    await executeUnpair(options);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onComplete is not provided', async () => {
    const options: UnpairOptions = { onStateChange: jest.fn() };

    await expect(executeUnpair(options)).resolves.toBeUndefined();
  });
});
