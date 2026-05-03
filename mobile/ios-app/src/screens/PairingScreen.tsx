import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { startScanning, type DiscoveredDevice } from '../utils/bleScanner';

interface Props {
  onDeviceSelected: (device: DiscoveredDevice) => void;
  onBack: () => void;
}

export default function PairingScreen({ onDeviceSelected, onBack }: Props) {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [noDevicesYet, setNoDevicesYet] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const managerRef = useRef<BleManager | null>(null);
  const noDevicesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const manager = new BleManager();
    managerRef.current = manager;

    // Show "no devices" hint after 8 seconds if nothing found
    noDevicesTimerRef.current = setTimeout(() => {
      setNoDevicesYet(true);
    }, 8000);

    startScanning(
      manager,
      (device) => {
        // Clear the "no devices" timer on first discovery
        if (noDevicesTimerRef.current) {
          clearTimeout(noDevicesTimerRef.current);
          noDevicesTimerRef.current = null;
        }
        setNoDevicesYet(false);
        setDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      },
      (message) => {
        setError(message);
        setScanning(false);
        if (noDevicesTimerRef.current) {
          clearTimeout(noDevicesTimerRef.current);
          noDevicesTimerRef.current = null;
        }
      },
    ).then((cleanup) => {
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0a0a0f' },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: '#888', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800', color: '#e0e0e8', marginBottom: 20 },
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
  errorText: { color: '#cc4444', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: '#7c8aff',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
