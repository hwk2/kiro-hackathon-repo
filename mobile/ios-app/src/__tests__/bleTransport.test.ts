import {
  BLE_TRANSPORT_CONFIG,
  createBleTransport,
  type BluetoothTransport,
  type TransportStatus,
} from '../utils/bleTransport';

// ---------------------------------------------------------------------------
// Mock react-native-ble-plx
// ---------------------------------------------------------------------------

const mockConnectToDevice = jest.fn();
const mockCancelDeviceConnection = jest.fn();
const mockOnDeviceDisconnected = jest.fn();

// Device mock helpers
const mockDiscoverAll = jest.fn();
const mockServices = jest.fn();

// Service mock helpers
const mockCharacteristics = jest.fn();

// Characteristic mock helpers
const mockWriteWithResponse = jest.fn();
const mockMonitor = jest.fn();

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
      connectToDevice: mockConnectToDevice,
      cancelDeviceConnection: mockCancelDeviceConnection,
      onDeviceDisconnected: mockOnDeviceDisconnected,
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockManager() {
  const { BleManager } = require('react-native-ble-plx');
  return new BleManager();
}

/** Build a mock write characteristic. */
function makeWriteCharacteristic(uuid: string) {
  return {
    uuid,
    writeWithResponse: mockWriteWithResponse,
  };
}

/** Build a mock read characteristic with monitor support. */
function makeReadCharacteristic(uuid: string) {
  return {
    uuid,
    monitor: mockMonitor,
  };
}

/** Build a mock service with the given characteristics. */
function makeService(uuid: string, characteristics: unknown[]) {
  return {
    uuid,
    characteristics: jest.fn().mockResolvedValue(characteristics),
  };
}

/**
 * Set up mocks so that connect() succeeds:
 * - connectToDevice resolves a device
 * - device discovers services with the correct UUIDs
 * - service has write + read characteristics
 */
function setupSuccessfulConnect() {
  const writeCh = makeWriteCharacteristic(
    BLE_TRANSPORT_CONFIG.writeCharacteristicUUID,
  );
  const readCh = makeReadCharacteristic(
    BLE_TRANSPORT_CONFIG.readCharacteristicUUID,
  );
  const service = makeService(BLE_TRANSPORT_CONFIG.serviceUUID, [writeCh, readCh]);

  const device = {
    id: 'device-1',
    discoverAllServicesAndCharacteristics: mockDiscoverAll.mockResolvedValue(undefined),
    services: mockServices.mockResolvedValue([service]),
  };

  mockConnectToDevice.mockResolvedValue(device);
  mockMonitor.mockReturnValue({ remove: jest.fn() });
  mockOnDeviceDisconnected.mockReturnValue({ remove: jest.fn() });
  mockWriteWithResponse.mockResolvedValue(null);

  return { device, service, writeCh, readCh };
}

/** Set up mocks so that connect() fails at the connectToDevice step. */
function setupFailedConnect() {
  mockConnectToDevice.mockRejectedValue(new Error('Connection failed'));
}

/** Set up mocks so that the target service is missing. */
function setupMissingService() {
  const device = {
    id: 'device-1',
    discoverAllServicesAndCharacteristics: mockDiscoverAll.mockResolvedValue(undefined),
    services: mockServices.mockResolvedValue([
      makeService('00000000-0000-0000-0000-000000000000', []),
    ]),
  };
  mockConnectToDevice.mockResolvedValue(device);
}

/** Set up mocks so that characteristics are missing. */
function setupMissingCharacteristics() {
  const service = makeService(BLE_TRANSPORT_CONFIG.serviceUUID, []);
  const device = {
    id: 'device-1',
    discoverAllServicesAndCharacteristics: mockDiscoverAll.mockResolvedValue(undefined),
    services: mockServices.mockResolvedValue([service]),
  };
  mockConnectToDevice.mockResolvedValue(device);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BLE_TRANSPORT_CONFIG', () => {
  it('uses the Room Vision AI service UUID', () => {
    expect(BLE_TRANSPORT_CONFIG.serviceUUID).toBe(
      '12345678-1234-1234-1234-123456789abc',
    );
  });

  it('has write and read characteristic UUIDs', () => {
    expect(BLE_TRANSPORT_CONFIG.writeCharacteristicUUID).toBeDefined();
    expect(BLE_TRANSPORT_CONFIG.readCharacteristicUUID).toBeDefined();
    expect(BLE_TRANSPORT_CONFIG.writeCharacteristicUUID).not.toBe(
      BLE_TRANSPORT_CONFIG.readCharacteristicUUID,
    );
  });

  it('defaults mtuSize to 512', () => {
    expect(BLE_TRANSPORT_CONFIG.mtuSize).toBe(512);
  });
});

describe('createBleTransport', () => {
  it('returns a valid BluetoothTransport object', () => {
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    expect(transport).toBeDefined();
    expect(transport.status).toBe('disconnected');
    expect(typeof transport.connect).toBe('function');
    expect(typeof transport.disconnect).toBe('function');
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.onData).toBe('function');
    expect(typeof transport.onStatusChange).toBe('function');
    expect(typeof transport.destroy).toBe('function');
  });

  it('starts with disconnected status', () => {
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    expect(transport.status).toBe('disconnected');
  });
});

describe('connect', () => {
  it('changes status to connected on success', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const result = await transport.connect('device-1');

    expect(result).toBe(true);
    expect(transport.status).toBe('connected');
  });

  it('transitions through connecting status', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    await transport.connect('device-1');

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses.indexOf('connecting')).toBeLessThan(
      statuses.indexOf('connected'),
    );
  });

  it('changes status to error on connection failure', async () => {
    setupFailedConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const result = await transport.connect('device-1');

    expect(result).toBe(false);
    expect(transport.status).toBe('error');
  });

  it('changes status to error when service is not found', async () => {
    setupMissingService();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const result = await transport.connect('device-1');

    expect(result).toBe(false);
    expect(transport.status).toBe('error');
  });

  it('changes status to error when characteristics are missing', async () => {
    setupMissingCharacteristics();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const result = await transport.connect('device-1');

    expect(result).toBe(false);
    expect(transport.status).toBe('error');
  });

  it('discovers services and characteristics on the device', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    await transport.connect('device-1');

    expect(mockConnectToDevice).toHaveBeenCalledWith('device-1');
    expect(mockDiscoverAll).toHaveBeenCalled();
    expect(mockServices).toHaveBeenCalled();
  });

  it('monitors the read characteristic for incoming data', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    await transport.connect('device-1');

    expect(mockMonitor).toHaveBeenCalledWith(expect.any(Function));
  });

  it('registers a device disconnection listener', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    await transport.connect('device-1');

    expect(mockOnDeviceDisconnected).toHaveBeenCalledWith(
      'device-1',
      expect.any(Function),
    );
  });
});

describe('disconnect', () => {
  it('changes status to disconnected', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');

    await transport.disconnect();

    expect(transport.status).toBe('disconnected');
  });

  it('calls cancelDeviceConnection on the manager', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');
    mockCancelDeviceConnection.mockResolvedValue(undefined);

    await transport.disconnect();

    expect(mockCancelDeviceConnection).toHaveBeenCalledWith('device-1');
  });

  it('notifies status change callbacks', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');

    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    await transport.disconnect();

    expect(statuses).toContain('disconnected');
  });

  it('handles disconnect when not connected', async () => {
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    // Should not throw
    await transport.disconnect();

    expect(transport.status).toBe('disconnected');
  });

  it('handles cancelDeviceConnection errors gracefully', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');
    mockCancelDeviceConnection.mockRejectedValue(new Error('Already disconnected'));

    await transport.disconnect();

    expect(transport.status).toBe('disconnected');
  });
});

describe('send', () => {
  it('chunks data into MTU-sized pieces', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    // Use a small MTU for easy testing
    const transport = createBleTransport(manager, {
      ...BLE_TRANSPORT_CONFIG,
      mtuSize: 4,
    });
    await transport.connect('device-1');

    // 10 bytes → should produce 3 chunks: 4 + 4 + 2
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const result = await transport.send(data);

    expect(result).toBe(true);
    expect(mockWriteWithResponse).toHaveBeenCalledTimes(3);
  });

  it('sends a single chunk when data fits within MTU', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager, {
      ...BLE_TRANSPORT_CONFIG,
      mtuSize: 512,
    });
    await transport.connect('device-1');

    const data = new Uint8Array([1, 2, 3]);
    const result = await transport.send(data);

    expect(result).toBe(true);
    expect(mockWriteWithResponse).toHaveBeenCalledTimes(1);
  });

  it('returns false when not connected', async () => {
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const result = await transport.send(new Uint8Array([1, 2, 3]));

    expect(result).toBe(false);
    expect(mockWriteWithResponse).not.toHaveBeenCalled();
  });

  it('returns false when write fails', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');
    mockWriteWithResponse.mockRejectedValue(new Error('Write failed'));

    const result = await transport.send(new Uint8Array([1, 2, 3]));

    expect(result).toBe(false);
  });

  it('writes base64-encoded chunks to the characteristic', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager, {
      ...BLE_TRANSPORT_CONFIG,
      mtuSize: 3,
    });
    await transport.connect('device-1');

    const data = new Uint8Array([65, 66, 67]); // "ABC" in ASCII
    await transport.send(data);

    // btoa("ABC") === "QUJD"
    expect(mockWriteWithResponse).toHaveBeenCalledWith('QUJD');
  });
});

describe('onData', () => {
  it('invokes callback when data arrives via characteristic notification', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const received: Uint8Array[] = [];
    transport.onData((data) => received.push(data));

    await transport.connect('device-1');

    // Simulate incoming data via the monitor callback
    const monitorCallback = mockMonitor.mock.calls[0][0];
    // btoa("Hi") === "SGk="
    monitorCallback(null, { value: 'SGk=' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(new Uint8Array([72, 105])); // "Hi"
  });

  it('invokes multiple registered callbacks', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const cb1 = jest.fn();
    const cb2 = jest.fn();
    transport.onData(cb1);
    transport.onData(cb2);

    await transport.connect('device-1');

    const monitorCallback = mockMonitor.mock.calls[0][0];
    monitorCallback(null, { value: 'SGk=' });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('ignores monitor errors without crashing', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const cb = jest.fn();
    transport.onData(cb);

    await transport.connect('device-1');

    const monitorCallback = mockMonitor.mock.calls[0][0];
    // Simulate an error — callback should not be invoked
    monitorCallback(new Error('BLE error'), null);

    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores notifications with null value', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const cb = jest.fn();
    transport.onData(cb);

    await transport.connect('device-1');

    const monitorCallback = mockMonitor.mock.calls[0][0];
    monitorCallback(null, { value: null });

    expect(cb).not.toHaveBeenCalled();
  });
});

describe('onStatusChange', () => {
  it('invokes callback on status changes', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    await transport.connect('device-1');

    expect(statuses).toEqual(['connecting', 'connected']);
  });

  it('invokes callback on disconnect', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');

    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    await transport.disconnect();

    expect(statuses).toContain('disconnected');
  });

  it('invokes callback on error', async () => {
    setupFailedConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    await transport.connect('device-1');

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('error');
  });

  it('invokes multiple registered callbacks', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const cb1 = jest.fn();
    const cb2 = jest.fn();
    transport.onStatusChange(cb1);
    transport.onStatusChange(cb2);

    await transport.connect('device-1');

    // Both should have been called for 'connecting' and 'connected'
    expect(cb1).toHaveBeenCalledTimes(2);
    expect(cb2).toHaveBeenCalledTimes(2);
  });
});

describe('device disconnection event', () => {
  it('sets status to disconnected when device disconnects unexpectedly', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');

    expect(transport.status).toBe('connected');

    // Simulate the device disconnecting
    const disconnectCallback = mockOnDeviceDisconnected.mock.calls[0][1];
    disconnectCallback();

    expect(transport.status).toBe('disconnected');
  });

  it('notifies status change callbacks on unexpected disconnect', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');

    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    const disconnectCallback = mockOnDeviceDisconnected.mock.calls[0][1];
    disconnectCallback();

    expect(statuses).toContain('disconnected');
  });
});

describe('destroy', () => {
  it('cleans up subscriptions', async () => {
    const monitorRemove = jest.fn();
    const disconnectRemove = jest.fn();
    mockMonitor.mockReturnValue({ remove: monitorRemove });
    mockOnDeviceDisconnected.mockReturnValue({ remove: disconnectRemove });

    setupSuccessfulConnect();
    // Re-apply the subscription mocks after setupSuccessfulConnect
    mockMonitor.mockReturnValue({ remove: monitorRemove });
    mockOnDeviceDisconnected.mockReturnValue({ remove: disconnectRemove });

    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');

    transport.destroy();

    expect(monitorRemove).toHaveBeenCalled();
    expect(disconnectRemove).toHaveBeenCalled();
  });

  it('resets status to disconnected', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');

    transport.destroy();

    expect(transport.status).toBe('disconnected');
  });

  it('clears data and status callbacks', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    const dataCb = jest.fn();
    const statusCb = jest.fn();
    transport.onData(dataCb);
    transport.onStatusChange(statusCb);

    await transport.connect('device-1');
    statusCb.mockClear();

    transport.destroy();

    // After destroy, callbacks should not fire on subsequent status changes
    // (status is set directly, not via setStatus, so callbacks are already cleared)
    expect(statusCb).not.toHaveBeenCalled();
  });

  it('attempts to cancel device connection', async () => {
    setupSuccessfulConnect();
    const manager = createMockManager();
    const transport = createBleTransport(manager);
    await transport.connect('device-1');
    mockCancelDeviceConnection.mockResolvedValue(undefined);

    transport.destroy();

    expect(mockCancelDeviceConnection).toHaveBeenCalledWith('device-1');
  });

  it('does not throw when called on a disconnected transport', () => {
    const manager = createMockManager();
    const transport = createBleTransport(manager);

    // Should not throw
    expect(() => transport.destroy()).not.toThrow();
  });
});
