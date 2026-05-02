import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  imageCount: number;
  onStartCapture: () => void;
  onViewImages: () => void;
}

export default function HomeScreen({ imageCount, onStartCapture, onViewImages }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📸</Text>
      <Text style={styles.title}>Room Vision AI</Text>
      <Text style={styles.subtitle}>
        Capture your room from multiple angles.{'\n'}
        We'll build a 3D model for you.
      </Text>

      <TouchableOpacity style={styles.primaryBtn} onPress={onStartCapture}>
        <Text style={styles.primaryBtnText}>Start Capture</Text>
      </TouchableOpacity>

      {imageCount > 0 && (
        <TouchableOpacity style={styles.secondaryBtn} onPress={onViewImages}>
          <Text style={styles.secondaryBtnText}>
            View Captured Images ({imageCount})
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.footer}>
        All images stay on your device.{'\n'}
        No accounts. No cloud. Just Bluetooth.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#e0e0e8', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 40 },
  primaryBtn: { backgroundColor: '#7c8aff', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 12, marginBottom: 12, width: '100%', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#1a1a2e', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  secondaryBtnText: { color: '#7c8aff', fontSize: 15, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 30, textAlign: 'center', color: '#555', fontSize: 12, lineHeight: 18 },
});
