import {
  createWebSocketTransport,
  DEFAULT_WS_PORT,
  DEFAULT_WS_URL,
} from '../utils/webSocketTransport';
import type { TransportStatus } from '../utils/bleTransport';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WSEventHandler = ((...args: unknown[]) => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  binaryType: string = '';
  onopen: WSEventHandler = null;
  onclose: WSEventHandler = null;
  onerror: WSEventHandler = null;
  onmessage: WSEventHandler = null;
  readyState: number = 0; // CONNECTING

  closed = false;
  sentData: unknown[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: unknown) {
    if (this.closed) throw new Error('WebSocket is closed');
    this.sentData.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3; // CLOSED
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.({} as Event);
  }

  simulateError() {
    this.onerror?.({} as Event);
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  simulateMessage(data: ArrayBuffer | string) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

// Replace global WebSocket with mock
(global as unknown as Record<string, unknown>).WebSocket = MockWebSocket;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLatestSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockWebSocket.instances = [];
});

describe('DEFAULT_WS_PORT', () => {
  it('is 8765', () => {
    expect(DEFAULT_WS_PORT).toBe(8765);
  });
});

describe('DEFAULT_WS_URL', () => {
  it('uses the default port', () => {
    expect(DEFAULT_WS_URL).toBe('ws://localhost:8765');
  });
});

describe('createWebSocketTransport', () => {
  it('returns a valid BluetoothTransport object', () => {
    const transport = createWebSocketTransport();

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
    const transport = createWebSocketTransport();
    expect(transport.status).toBe('disconnected');
  });
});

describe('connect', () => {
  it('creates a WebSocket with the default URL', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');

    const socket = getLatestSocket();
    expect(socket.url).toBe('ws://localhost:8765');

    socket.simulateOpen();
    await connectPromise;
  });

  it('creates a WebSocket with a custom URL', async () => {
    const transport = createWebSocketTransport('ws://192.168.1.100:9000');
    const connectPromise = transport.connect('');

    const socket = getLatestSocket();
    expect(socket.url).toBe('ws://192.168.1.100:9000');

    socket.simulateOpen();
    await connectPromise;
  });

  it('sets binaryType to arraybuffer', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');

    const socket = getLatestSocket();
    expect(socket.binaryType).toBe('arraybuffer');

    socket.simulateOpen();
    await connectPromise;
  });

  it('returns true and sets status to connected on success', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');

    const socket = getLatestSocket();
    socket.simulateOpen();

    const result = await connectPromise;
    expect(result).toBe(true);
    expect(transport.status).toBe('connected');
  });

  it('transitions through connecting status', async () => {
    const transport = createWebSocketTransport();
    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    const connectPromise = transport.connect('');

    const socket = getLatestSocket();
    socket.simulateOpen();

    await connectPromise;

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses.indexOf('connecting')).toBeLessThan(statuses.indexOf('connected'));
  });

  it('returns false and sets status to error on WebSocket error', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');

    const socket = getLatestSocket();
    socket.simulateError();

    const result = await connectPromise;
    expect(result).toBe(false);
    expect(transport.status).toBe('error');
  });

  it('returns false and sets status to error when connection closes during connecting', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');

    const socket = getLatestSocket();
    socket.simulateClose();

    const result = await connectPromise;
    expect(result).toBe(false);
    expect(transport.status).toBe('error');
  });
});

describe('disconnect', () => {
  it('closes the WebSocket and sets status to disconnected', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    await transport.disconnect();

    expect(socket.closed).toBe(true);
    expect(transport.status).toBe('disconnected');
  });

  it('notifies status change callbacks', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    await transport.disconnect();

    expect(statuses).toContain('disconnected');
  });

  it('handles disconnect when not connected', async () => {
    const transport = createWebSocketTransport();

    await transport.disconnect();

    expect(transport.status).toBe('disconnected');
  });
});

describe('send', () => {
  it('sends data over the WebSocket', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    const data = new Uint8Array([1, 2, 3, 4]);
    const result = await transport.send(data);

    expect(result).toBe(true);
    expect(socket.sentData).toHaveLength(1);
    expect(socket.sentData[0]).toEqual(data);
  });

  it('returns false when not connected', async () => {
    const transport = createWebSocketTransport();

    const result = await transport.send(new Uint8Array([1, 2, 3]));

    expect(result).toBe(false);
  });

  it('returns false when send throws', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    // Force the socket to be closed so send throws
    socket.closed = true;

    const result = await transport.send(new Uint8Array([1, 2, 3]));

    expect(result).toBe(false);
  });
});

describe('onData', () => {
  it('invokes callback when ArrayBuffer message arrives', async () => {
    const transport = createWebSocketTransport();
    const received: Uint8Array[] = [];
    transport.onData((data) => received.push(data));

    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    const buffer = new Uint8Array([10, 20, 30]).buffer;
    socket.simulateMessage(buffer);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(new Uint8Array([10, 20, 30]));
  });

  it('invokes callback when string message arrives', async () => {
    const transport = createWebSocketTransport();
    const received: Uint8Array[] = [];
    transport.onData((data) => received.push(data));

    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    socket.simulateMessage('hello');

    expect(received).toHaveLength(1);
    // TextEncoder encodes "hello" as [104, 101, 108, 108, 111]
    expect(received[0]).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it('invokes multiple registered callbacks', async () => {
    const transport = createWebSocketTransport();
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    transport.onData(cb1);
    transport.onData(cb2);

    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    const buffer = new Uint8Array([1]).buffer;
    socket.simulateMessage(buffer);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

describe('onStatusChange', () => {
  it('invokes callback on status changes', async () => {
    const transport = createWebSocketTransport();
    const statuses: TransportStatus[] = [];
    transport.onStatusChange((s) => statuses.push(s));

    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    expect(statuses).toEqual(['connecting', 'connected']);
  });
});

describe('WebSocket close after connected', () => {
  it('sets status to disconnected when WebSocket closes after connection', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    expect(transport.status).toBe('connected');

    socket.simulateClose();

    expect(transport.status).toBe('disconnected');
  });
});

describe('destroy', () => {
  it('closes the WebSocket', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    transport.destroy();

    expect(socket.closed).toBe(true);
  });

  it('resets status to disconnected', async () => {
    const transport = createWebSocketTransport();
    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    transport.destroy();

    expect(transport.status).toBe('disconnected');
  });

  it('clears callbacks so they are not invoked after destroy', async () => {
    const transport = createWebSocketTransport();
    const cb = jest.fn();
    transport.onStatusChange(cb);

    const connectPromise = transport.connect('');
    const socket = getLatestSocket();
    socket.simulateOpen();
    await connectPromise;

    cb.mockClear();
    transport.destroy();

    // After destroy, status callbacks should be cleared
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not throw when called on a disconnected transport', () => {
    const transport = createWebSocketTransport();
    expect(() => transport.destroy()).not.toThrow();
  });
});
