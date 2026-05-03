import {
  ROOM_VISION_SERVICE_UUID,
  startScanning,
  stopScanning,
  type DiscoveredDevice,
} from '../utils/bleScanner';

// ---------------------------------------------------------------------------
// Mock react-native-ble-plx
// ---------------------------------------------------------------------------

const mockStartDeviceScan = jest.fn();
const mockStopDeviceScan = jest.fn();
const mockState = jest.fn();
const mockOnStateChange = jest.fn();

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
      startDeviceScan: mockStartDeviceScan,
      stopDeviceScan: mockStopDeviceScan,
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock blePermissions
// ---------------------------------------------------------------------------

const mockRequestBlePermission = jest.fn();

jest.mock('../utils/blePermissions', () => ({
  requestBlePermission: (...args: unknown[]) => mockRequestBlePermission(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockManager() {
  const { BleManager } = require('react-native-ble-plx');
  return new BleManager();
}

function makeDevice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'device-1',
    name: 'Desktop-Room-Vision',
    localName: null,
    rssi: -55,
    ...overrides,
  };
}

function permissionAvailable() {
  mockRequestBlePermission.mockResolvedValue({
    available: true,
    status: 'ready',
    rawState: 'PoweredOn',
    message: 'Bluetooth is ready.',
  });
}

function permissionUnavailable(message = 'Bluetooth is turned off. Please enable Bluetooth in Settings.') {
  mockRequestBlePermission.mockResolvedValue({
    available: false,
    status: 'powered_off',
    rawState: 'PoweredOff',
    message,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ROOM_VISION_SERVICE_UUID', () => {
  it('exports a valid UUID string', () => {
    expect(ROOM_VISION_SERVICE_UUID).toBe('12345678-1234-1234-1234-123456789abc');
  });
});

describe('startScanning', () => {
  it('calls requestBlePermission with the provided manager', async () => {
    permissionAvailable();
    const manager = createMockManager();

    await startScanning(manager, jest.fn());

    expect(mockRequestBlePermission).toHaveBeenCalledWith(manager);
  });

  it('starts scanning filtered by the Room Vision service UUID when BLE is available', async () => {
    permissionAvailable();
    const manager = createMockManager();

    await startScanning(manager, jest.fn());

    expect(mockStartDeviceScan).toHaveBeenCalledTimes(1);
    expect(mockStartDeviceScan).toHaveBeenCalledWith(
      [ROOM_VISION_SERVICE_UUID],
      null,
      expect.any(Function),
    );
  });

  it('does not start scanning when BLE is not available', async () => {
    permissionUnavailable();
    const manager = createMockManager();

    await startScanning(manager, jest.fn());

    expect(mockStartDeviceScan).not.toHaveBeenCalled();
  });

  it('calls onError with the permission message when BLE is not available', async () => {
    const errorMessage = 'Bluetooth is turned off. Please enable Bluetooth in Settings.';
    permissionUnavailable(errorMessage);
    const manager = createMockManager();
    const onError = jest.fn();

    await startScanning(manager, jest.fn(), onError);

    expect(onError).toHaveBeenCalledWith(errorMessage);
  });

  it('maps discovered devices to the DiscoveredDevice interface', async () => {
    permissionAvailable();
    const manager = createMockManager();
    const onDeviceFound = jest.fn();

    await startScanning(manager, onDeviceFound);

    // Simulate the scan listener being called with a device
    const listener = mockStartDeviceScan.mock.calls[0][2];
    const device = makeDevice({ id: 'abc-123', name: 'My Desktop', rssi: -42 });
    listener(null, device);

    expect(onDeviceFound).toHaveBeenCalledTimes(1);
    const discovered: DiscoveredDevice = onDeviceFound.mock.calls[0][0];
    expect(discovered.id).toBe('abc-123');
    expect(discovered.name).toBe('My Desktop');
    expect(discovered.rssi).toBe(-42);
    expect(discovered.discoveredAt).toBeDefined();
    // Verify it's a valid ISO timestamp
    expect(new Date(discovered.discoveredAt).toISOString()).toBe(discovered.discoveredAt);
  });

  it('uses localName when name is null', async () => {
    permissionAvailable();
    const manager = createMockManager();
    const onDeviceFound = jest.fn();

    await startScanning(manager, onDeviceFound);

    const listener = mockStartDeviceScan.mock.calls[0][2];
    listener(null, makeDevice({ name: null, localName: 'Local Desktop' }));

    const discovered: DiscoveredDevice = onDeviceFound.mock.calls[0][0];
    expect(discovered.name).toBe('Local Desktop');
  });

  it('uses "Unknown Device" when both name and localName are null', async () => {
    permissionAvailable();
    const manager = createMockManager();
    const onDeviceFound = jest.fn();

    await startScanning(manager, onDeviceFound);

    const listener = mockStartDeviceScan.mock.calls[0][2];
    listener(null, makeDevice({ name: null, localName: null }));

    const discovered: DiscoveredDevice = onDeviceFound.mock.calls[0][0];
    expect(discovered.name).toBe('Unknown Device');
  });

  it('deduplicates devices by ID — same device not reported twice', async () => {
    permissionAvailable();
    const manager = createMockManager();
    const onDeviceFound = jest.fn();

    await startScanning(manager, onDeviceFound);

    const listener = mockStartDeviceScan.mock.calls[0][2];
    const device = makeDevice({ id: 'dup-device' });

    listener(null, device);
    listener(null, device);
    listener(null, device);

    expect(onDeviceFound).toHaveBeenCalledTimes(1);
  });

  it('reports different devices with different IDs', async () => {
    permissionAvailable();
    const manager = createMockManager();
    const onDeviceFound = jest.fn();

    await startScanning(manager, onDeviceFound);

    const listener = mockStartDeviceScan.mock.calls[0][2];
    listener(null, makeDevice({ id: 'device-a', name: 'Desktop A' }));
    listener(null, makeDevice({ id: 'device-b', name: 'Desktop B' }));

    expect(onDeviceFound).toHaveBeenCalledTimes(2);
    expect(onDeviceFound.mock.calls[0][0].id).toBe('device-a');
    expect(onDeviceFound.mock.calls[1][0].id).toBe('device-b');
  });

  it('calls onError when the scan listener receives an error', async () => {
    permissionAvailable();
    const manager = createMockManager();
    const onError = jest.fn();

    await startScanning(manager, jest.fn(), onError);

    const listener = mockStartDeviceScan.mock.calls[0][2];
    listener({ message: 'Scan failed' }, null);

    expect(onError).toHaveBeenCalledWith('Scan failed');
  });

  it('ignores null device without error', async () => {
    permissionAvailable();
    const manager = createMockManager();
    const onDeviceFound = jest.fn();

    await startScanning(manager, onDeviceFound);

    const listener = mockStartDeviceScan.mock.calls[0][2];
    listener(null, null);

    expect(onDeviceFound).not.toHaveBeenCalled();
  });

  it('returns a cleanup function that stops scanning', async () => {
    permissionAvailable();
    const manager = createMockManager();

    const cleanup = await startScanning(manager, jest.fn());

    expect(mockStopDeviceScan).not.toHaveBeenCalled();
    cleanup();
    expect(mockStopDeviceScan).toHaveBeenCalledTimes(1);
  });

  it('returns a no-op cleanup function when BLE is not available', async () => {
    permissionUnavailable();
    const manager = createMockManager();

    const cleanup = await startScanning(manager, jest.fn());

    // Should not throw and should not call stopDeviceScan
    cleanup();
    expect(mockStopDeviceScan).not.toHaveBeenCalled();
  });
});

describe('stopScanning', () => {
  it('calls stopDeviceScan on the manager', () => {
    const manager = createMockManager();

    stopScanning(manager);

    expect(mockStopDeviceScan).toHaveBeenCalledTimes(1);
  });
});
