import {
  INITIAL_CONNECTION_STATE,
  createConnectionState,
  isConnected,
  isReconnecting,
  getStatusMessage,
  getStatusColor,
  type ConnectionStatus,
} from '../utils/bleConnectionManager';

// ---------------------------------------------------------------------------
// INITIAL_CONNECTION_STATE
// ---------------------------------------------------------------------------

describe('INITIAL_CONNECTION_STATE', () => {
  it('defaults to disconnected with null device info', () => {
    expect(INITIAL_CONNECTION_STATE.status).toBe('disconnected');
    expect(INITIAL_CONNECTION_STATE.deviceId).toBeNull();
    expect(INITIAL_CONNECTION_STATE.deviceName).toBeNull();
    expect(INITIAL_CONNECTION_STATE.reconnectAttempts).toBe(0);
    expect(INITIAL_CONNECTION_STATE.lastUpdated).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// createConnectionState
// ---------------------------------------------------------------------------

describe('createConnectionState', () => {
  it('creates a connected state with device info', () => {
    const state = createConnectionState('connected', 'dev-1', 'My Desktop');
    expect(state.status).toBe('connected');
    expect(state.deviceId).toBe('dev-1');
    expect(state.deviceName).toBe('My Desktop');
    expect(state.reconnectAttempts).toBe(0);
    expect(state.lastUpdated).toBeTruthy();
  });

  it('creates a reconnecting state with attempt count', () => {
    const state = createConnectionState('reconnecting', 'dev-1', 'My Desktop', 2);
    expect(state.status).toBe('reconnecting');
    expect(state.reconnectAttempts).toBe(2);
  });

  it('defaults deviceId, deviceName, and reconnectAttempts when omitted', () => {
    const state = createConnectionState('disconnected');
    expect(state.deviceId).toBeNull();
    expect(state.deviceName).toBeNull();
    expect(state.reconnectAttempts).toBe(0);
  });

  it('sets lastUpdated to a valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const state = createConnectionState('connecting', 'dev-1', 'Desktop');
    const after = new Date().toISOString();
    expect(state.lastUpdated >= before).toBe(true);
    expect(state.lastUpdated <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isConnected / isReconnecting
// ---------------------------------------------------------------------------

describe('isConnected', () => {
  it('returns true for connected status', () => {
    expect(isConnected(createConnectionState('connected'))).toBe(true);
  });

  it.each<ConnectionStatus>(['disconnected', 'connecting', 'reconnecting'])(
    'returns false for %s status',
    (status) => {
      expect(isConnected(createConnectionState(status))).toBe(false);
    },
  );
});

describe('isReconnecting', () => {
  it('returns true for reconnecting status', () => {
    expect(isReconnecting(createConnectionState('reconnecting'))).toBe(true);
  });

  it.each<ConnectionStatus>(['disconnected', 'connecting', 'connected'])(
    'returns false for %s status',
    (status) => {
      expect(isReconnecting(createConnectionState(status))).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// getStatusMessage
// ---------------------------------------------------------------------------

describe('getStatusMessage', () => {
  it('returns "Connected to {name}" when connected with a device name', () => {
    const state = createConnectionState('connected', 'dev-1', 'Office PC');
    expect(getStatusMessage(state)).toBe('Connected to Office PC');
  });

  it('returns "Connected to device" when connected without a device name', () => {
    const state = createConnectionState('connected', 'dev-1');
    expect(getStatusMessage(state)).toBe('Connected to device');
  });

  it('returns "Connecting to {name}..." when connecting', () => {
    const state = createConnectionState('connecting', 'dev-1', 'Office PC');
    expect(getStatusMessage(state)).toBe('Connecting to Office PC...');
  });

  it('returns "Connecting to device..." when connecting without a name', () => {
    const state = createConnectionState('connecting');
    expect(getStatusMessage(state)).toBe('Connecting to device...');
  });

  it('returns "Reconnecting... (attempt n/3)" when reconnecting', () => {
    const state = createConnectionState('reconnecting', 'dev-1', 'Office PC', 2);
    expect(getStatusMessage(state)).toBe('Reconnecting... (attempt 2/3)');
  });

  it('returns "Not connected" when disconnected', () => {
    const state = createConnectionState('disconnected');
    expect(getStatusMessage(state)).toBe('Not connected');
  });
});

// ---------------------------------------------------------------------------
// getStatusColor
// ---------------------------------------------------------------------------

describe('getStatusColor', () => {
  it.each<[ConnectionStatus, string]>([
    ['connected', '#44aa44'],
    ['connecting', '#7c8aff'],
    ['reconnecting', '#cc8800'],
    ['disconnected', '#cc4444'],
  ])('returns %s for %s status', (status, expectedColor) => {
    const state = createConnectionState(status);
    expect(getStatusColor(state)).toBe(expectedColor);
  });
});
