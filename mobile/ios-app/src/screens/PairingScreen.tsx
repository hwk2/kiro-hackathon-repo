import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { isWeb } from '../utils/platformDetect';
import { createWebSocketTransport, DEFAULT_WS_URL } from '../utils/webSocketTransport';
import type { BluetoothTransport, TransportStatus } from '../utils/bleTransport';
import type { DiscoveredDevice } from '../utils/bleScanner';

interface Props {
  onDeviceSelected: (device: DiscoveredDevice) => void;
  onBack: () => void;
}

export default function PairingScreen({ onDeviceSelected, onBack }: Props) {
  if (isWeb()) {
    return <WebPairingScreen onDeviceSelected={onDeviceSelected} onBack={onBack} />;
  }
  return <NativePairingScreen onDeviceSelected={onDeviceSelected} onBack={onBack} />;
}

// ---------------------------------------------------------------------------
// Web Pairing Screen — WebSocket-based connection
// ---------------------------------------------------------------------------

function WebPairingScreen({ onDeviceSelected, onBack }: Props) {
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [connectionStatus, setConnectionStatus] = useState<TransportStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const transportRef = useRef<BluetoothTransport | null>(null);

  useEffect(() => {
    return () => {
      transportRef.current?.destroy();
    };
  }, []);

  const handleConnect = async () => {
    setError(null);

    // Clean up previous transport if any
    transportRef.current?.destroy();

    const transport = createWebSocketTransport(wsUrl);
    transportRef.current = transport;

    transport.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    const success = await transport.connect(wsUrl);

    if (success) {
      // Create a synthetic DiscoveredDevice for the WebSocket connection
      const device: DiscoveredDevice = {
        id: `ws-${wsUrl}`,
        name: `Desktop (${wsUrl})`,
        rssi: null,
        discoveredAt: new Date().toISOString(),
      };
      onDeviceSelected(device);
    } else {
      setError('Could not connect. Make sure the desktop app is running and the URL is correct.');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} testID="back-button">
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Pair Desktop</Text>

      <View style={styles.webNote}>
        <Text style={styles.webNoteText}>
          🌐 Web Demo Mode{'\n\n'}
          Native apps use Bluetooth for pairing. In the web demo, connect to your desktop via WebSocket instead.
        </Text>
      </View>

      <Text style={styles.inputLabel}>Desktop WebSocket URL</Text>
      <TextInput
        style={styles.textInput}
        value={wsUrl}
        onChangeText={setWsUrl}
        placeholder="ws://localhost:8765"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
        testID="ws-url-input"
      />

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                connectionStatus === 'connected'
                  ? '#44aa44'
                  : connectionStatus === 'connecting'
                    ? '#7c8aff'
                    : connectionStatus === 'error'
                      ? '#cc4444'
                      : '#555',
            },
          ]}
        />
        <Text style={styles.statusText}>
          {connectionStatus === 'connected'
            ? 'Connected'
            : connectionStatus === 'connecting'
              ? 'Connecting...'
              : connectionStatus === 'error'
                ? 'Connection failed'
                : 'Not connected'}
        </Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.primaryBtn, connectionStatus === 'connecting' && styles.disabledBtn]}
        onPress={handleConnect}
        disabled={connectionStatus === 'connecting'}
        testID="connect-button"
      >
        {connectionStatus === 'connecting' ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>Connect</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Native Pairing Screen — BLE-based scanning (original behavior)
// ---------------------------------------------------------------------------

function NativePairingScreen({ onDeviceSelected, onBack }: Props) {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [noDevicesYet, setNoDevicesYet] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const managerRef = useRef<unknown>(null);
  const noDevicesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Dynamic import to avoid loading react-native-ble-plx on web
    const { BleManager } = require('react-native-ble-plx');
    const { startScanning } = require('../utils/bleScanner');

    const manager = new BleManager();
    managerRef.current = manager;

    // Show "no devices" hint after 8 seconds if nothing found
    noDevicesTimerRef.current = setTimeout(() => {
      setNoDevicesYet(true);
    }, 8000);

    startScanning(
      manager,
      (device: DiscoveredDevice) => {
        // Clear the "no devices" timer on first discovery
        if (noDevicesTimerRef.current) {
          clearTimeout(noDevicesTimerRef.current);
          noDevicesTimerRef.current = null;
        }
        setNoDevicesYet(false);
        setDevices((prev: DiscoveredDevice[]) => {
          if (prev.some((d: DiscoveredDevice) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      },
      (message: string) => {
        setError(message);
        setScanning(false);
        if (noDevicesTimerRef.current) {
          clearTimeout(noDevicesTimerRef.current);
          noDevicesTimerRef.current = null;
        }
      },
    ).then((cleanup: () => void) => {
      cleanupRef.current = cleanup;
    });

    return () => {
      cleanupRef.current?.();
      if (noDevicesTimerRef.current) {
        clearTimeout(noDevicesTimerRef.current);
      }
      manager.destroy();
    };
  }, []);

  /** Human-readable signal strength label. */
  const rssiLabel = (rssi: number | null): string => {
    if (rssi === null) return '—';
    if (rssi >= -50) return 'Strong';
    if (rssi >= -70) return 'Good';
    if (rssi >= -85) return 'Weak';
    return 'Very Weak';
  };

  const rssiColor = (rssi: number | null): string => {
    if (rssi === null) return '#555';
    if (rssi >= -50) return '#44aa44';
    if (rssi >= -70) return '#88aa44';
    if (rssi >= -85) return '#cc8800';
    return '#cc4444';
  };

  const confirmPairing = (device: DiscoveredDevice) => {
    Alert.alert(
      `Pair with ${device.name}?`,
      'This will establish a Bluetooth connection for transferring room images.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pair', onPress: () => onDeviceSelected(device) },
      ],
    );
  };

  const renderDevice = ({ item }: { item: DiscoveredDevice }) => (
    <View style={styles.deviceCard}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <View style={styles.rssiRow}>
          <View style={[styles.rssiDot, { backgroundColor: rssiColor(item.rssi) }]} />
          <Text style={styles.rssiText}>
            {rssiLabel(item.rssi)}
            {item.rssi !== null ? ` (${item.rssi} dBm)` : ''}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.connectBtn}
        onPress={() => confirmPairing(item)}
        testID={`connect-${item.id}`}
      >
        <Text style={styles.connectBtnText}>Connect</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} testID="back-button">
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Pair Desktop</Text>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onBack}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {scanning && (
            <View style={styles.scanningRow}>
              <ActivityIndicator color="#7c8aff" size="small" />
              <Text style={styles.scanningText}>Scanning for desktops...</Text>
            </View>
          )}

          {devices.length > 0 ? (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={renderDevice}
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            noDevicesYet &&
            !error && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  No desktops found yet.{'\n'}Make sure the Room Vision AI desktop app is running and Bluetooth is enabled.
                </Text>
              </View>
            )
          )}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0a0a0f' },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: '#888', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800', color: '#e0e0e8', marginBottom: 20 },
  // Web-specific styles
  webNote: {
    backgroundColor: '#161620',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
    marginBottom: 24,
  },
  webNoteText: { color: '#888', fontSize: 14, lineHeight: 22 },
  inputLabel: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  textInput: {
    backgroundColor: '#161620',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    color: '#e0e0e8',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#888', fontSize: 14 },
  disabledBtn: { opacity: 0.6 },
  // Native-specific styles
  scanningRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  scanningText: { color: '#888', fontSize: 14 },
  list: { flex: 1 },
  listContent: { gap: 10 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161620',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
  },
  deviceInfo: { flex: 1 },
  deviceName: { color: '#e0e0e8', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  rssiRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rssiDot: { width: 8, height: 8, borderRadius: 4 },
  rssiText: { color: '#888', fontSize: 12 },
  connectBtn: {
    backgroundColor: '#7c8aff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  connectBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorEmoji: { fontSize: 48 },
  errorText: { color: '#cc4444', fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 8 },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: '#7c8aff',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
