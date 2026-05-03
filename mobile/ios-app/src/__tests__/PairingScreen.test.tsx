import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import PairingScreen from '../screens/PairingScreen';
import type { DiscoveredDevice } from '../utils/bleScanner';

// ---------------------------------------------------------------------------
// Mock react-native-ble-plx
// ---------------------------------------------------------------------------

const mockDestroy = jest.fn();

jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn().mockImplementation(() => ({
    destroy: mockDestroy,
  })),
}));

// ---------------------------------------------------------------------------
// Mock bleScanner
// ---------------------------------------------------------------------------

let capturedOnDeviceFound: ((device: DiscoveredDevice) => void) | null = null;
let capturedOnError: ((message: string) => void) | null = null;
const mockCleanup = jest.fn();

const mockStartScanning = jest.fn().mockImplementation(
  (
    _manager: unknown,
    onDeviceFound: (device: DiscoveredDevice) => void,
    onError?: (message: string) => void,
  ) => {
    capturedOnDeviceFound = onDeviceFound;
    capturedOnError = onError ?? null;
    return Promise.resolve(mockCleanup);
  },
);

jest.mock('../utils/bleScanner', () => ({
  startScanning: (...args: unknown[]) => mockStartScanning(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDevice(overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    id: 'device-1',
    name: 'Desktop-Room-Vision',
    rssi: -55,
    discoveredAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  capturedOnDeviceFound = null;
  capturedOnError = null;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PairingScreen', () => {
  it('starts scanning on mount', async () => {
    render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    await waitFor(() => {
      expect(mockStartScanning).toHaveBeenCalledTimes(1);
    });

    // First arg is a BleManager instance, second is onDeviceFound, third is onError
    expect(mockStartScanning).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('shows scanning indicator', () => {
    const { getByText } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    expect(getByText('Scanning for desktops...')).toBeTruthy();
  });

  it('displays discovered devices in the list', async () => {
    const { getByText } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(capturedOnDeviceFound).not.toBeNull());

    await act(() => {
      capturedOnDeviceFound!(makeDevice({ id: 'dev-a', name: 'My Desktop' }));
    });

    expect(getByText('My Desktop')).toBeTruthy();
  });

  it('displays multiple discovered devices', async () => {
    const { getByText } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(capturedOnDeviceFound).not.toBeNull());

    await act(() => {
      capturedOnDeviceFound!(makeDevice({ id: 'dev-a', name: 'Desktop A' }));
      capturedOnDeviceFound!(makeDevice({ id: 'dev-b', name: 'Desktop B' }));
    });

    expect(getByText('Desktop A')).toBeTruthy();
    expect(getByText('Desktop B')).toBeTruthy();
  });

  it('shows confirmation dialog when tapping Connect on a device', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onDeviceSelected = jest.fn();
    const { getByTestId } = render(
      <PairingScreen onDeviceSelected={onDeviceSelected} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(capturedOnDeviceFound).not.toBeNull());

    const device = makeDevice({ id: 'dev-a', name: 'My Desktop' });
    await act(() => {
      capturedOnDeviceFound!(device);
    });

    fireEvent.press(getByTestId('connect-dev-a'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Pair with My Desktop?',
      'This will establish a Bluetooth connection for transferring room images.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Pair', onPress: expect.any(Function) }),
      ]),
    );
    // onDeviceSelected should NOT be called yet (user hasn't confirmed)
    expect(onDeviceSelected).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('calls onDeviceSelected when user confirms pairing in the dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onDeviceSelected = jest.fn();
    const { getByTestId } = render(
      <PairingScreen onDeviceSelected={onDeviceSelected} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(capturedOnDeviceFound).not.toBeNull());

    const device = makeDevice({ id: 'dev-a', name: 'My Desktop' });
    await act(() => {
      capturedOnDeviceFound!(device);
    });

    fireEvent.press(getByTestId('connect-dev-a'));

    // Simulate pressing the "Pair" button (index 1)
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2];
    buttons[1].onPress();

    expect(onDeviceSelected).toHaveBeenCalledTimes(1);
    expect(onDeviceSelected).toHaveBeenCalledWith(device);

    alertSpy.mockRestore();
  });

  it('does NOT call onDeviceSelected when user cancels the pairing dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onDeviceSelected = jest.fn();
    const { getByTestId } = render(
      <PairingScreen onDeviceSelected={onDeviceSelected} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(capturedOnDeviceFound).not.toBeNull());

    const device = makeDevice({ id: 'dev-a', name: 'My Desktop' });
    await act(() => {
      capturedOnDeviceFound!(device);
    });

    fireEvent.press(getByTestId('connect-dev-a'));

    // Simulate pressing the "Cancel" button (index 0)
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2];
    // Cancel button has no onPress, but calling it should be safe
    if (buttons[0].onPress) {
      buttons[0].onPress();
    }

    expect(onDeviceSelected).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('calls onBack when tapping the back button', () => {
    const onBack = jest.fn();
    const { getByTestId } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={onBack} />,
    );

    fireEvent.press(getByTestId('back-button'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('cleans up scanning on unmount', async () => {
    const { unmount } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    // Wait for startScanning to resolve so cleanupRef is set
    await waitFor(() => expect(mockStartScanning).toHaveBeenCalled());

    // Allow the promise to resolve
    await act(async () => {});

    unmount();

    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('displays error message when scanning fails', async () => {
    const { getByText, queryByText } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(capturedOnError).not.toBeNull());

    await act(() => {
      capturedOnError!('Bluetooth is turned off. Please enable Bluetooth in Settings.');
    });

    expect(
      getByText('Bluetooth is turned off. Please enable Bluetooth in Settings.'),
    ).toBeTruthy();
    // Scanning indicator should be gone
    expect(queryByText('Scanning for desktops...')).toBeNull();
  });

  it('shows no-devices message after timeout when no devices found', async () => {
    const { getByText } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    // Advance past the 8-second "no devices" timer
    await act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(
      getByText(/No desktops found yet/),
    ).toBeTruthy();
  });

  it('shows signal strength for discovered devices', async () => {
    const { getByText } = render(
      <PairingScreen onDeviceSelected={jest.fn()} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(capturedOnDeviceFound).not.toBeNull());

    await act(() => {
      capturedOnDeviceFound!(makeDevice({ id: 'dev-strong', name: 'My Desktop', rssi: -40 }));
    });

    expect(getByText('My Desktop')).toBeTruthy();
    expect(getByText(/Strong.*\-40 dBm/)).toBeTruthy();
  });
});
