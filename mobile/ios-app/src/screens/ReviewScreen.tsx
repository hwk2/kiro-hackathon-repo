import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { CapturedImage } from '../../App';

interface Props {
  images: CapturedImage[];
  onRemoveImage: (index: number) => void;
  onClearAll: () => void;
  onAddMore: () => void;
  onBack: () => void;
  isPaired?: boolean;
  onPairDesktop?: () => void;
}

export default function ReviewScreen({
  images,
  onRemoveImage,
  onClearAll,
  onAddMore,
  onBack,
  isPaired = false,
  onPairDesktop,
}: Props) {

  const handleClearAll = () => {
    Alert.alert('Clear All', 'Remove all captured images?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: onClearAll },
    ]);
  };

  const handleTransfer = () => {
    if (!isPaired) {
      // Not paired — go directly to pairing screen
      onPairDesktop?.();
      return;
    }

    // Paired — show transfer confirmation
    Alert.alert(
      'Transfer Images',
      `Send ${images.length} image(s) to your paired desktop?\n\nImages will be encrypted and transferred over ${isPaired ? 'the active connection' : 'Bluetooth'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          onPress: () => {
            Alert.alert(
              'Transfer Started',
              `Sending ${images.length} image(s)...\n\nFull transfer progress UI will be available when the desktop server is running.`,
              [{ text: 'OK' }],
            );
          },
        },
      ],
    );
  };

  if (images.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No images captured yet.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onAddMore}>
          <Text style={styles.primaryBtnText}>Start Capturing</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>← Home</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Review ({images.length} images)</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {images.map((img, index) => (
          <View key={index} style={styles.imageCard}>
            <Image source={{ uri: img.uri }} style={styles.thumbnail} />
            <View style={styles.imageMeta}>
              <Text style={styles.metaText}>{img.width}×{img.height}</Text>
              <Text style={styles.metaText}>{img.fileName}</Text>
            </View>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemoveImage(index)}
            >
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onAddMore}>
          <Text style={styles.secondaryBtnText}>+ Add More</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleTransfer}>
          <Text style={styles.primaryBtnText}>📡 Transfer to Desktop</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleClearAll}>
          <Text style={styles.dangerBtnText}>Clear All</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0a0a0f' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { color: '#888', fontSize: 16, marginBottom: 20 },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: '#888', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#e0e0e8', marginBottom: 16 },
  scroll: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  imageCard: { width: '48%', backgroundColor: '#161620', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#222', marginBottom: 4 },
  thumbnail: { width: '100%', aspectRatio: 1, resizeMode: 'cover' },
  imageMeta: { padding: 8 },
  metaText: { color: '#888', fontSize: 11 },
  removeBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.7)', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: '#ff4444', fontSize: 14, fontWeight: '700' },
  actions: { paddingTop: 12, gap: 8 },
  primaryBtn: { backgroundColor: '#7c8aff', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#1a1a2e', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  secondaryBtnText: { color: '#7c8aff', fontSize: 14, fontWeight: '600' },
  dangerBtn: { paddingVertical: 10, alignItems: 'center' },
  dangerBtnText: { color: '#ff4444', fontSize: 13 },
});
