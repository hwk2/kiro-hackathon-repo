import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface Props {
  onContinue: () => void;
  onBack: () => void;
}

export default function CaptureGuideScreen({ onContinue, onBack }: Props) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>📋 Capture Guide</Text>
      <Text style={styles.subtitle}>Follow these steps for the best 3D model.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Minimum: 4 images</Text>
        <Text style={styles.cardBody}>
          Take one photo facing each wall (north, south, east, west).
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recommended: 8-12 images</Text>
        <Text style={styles.cardBody}>
          • 4 wall-facing shots{'\n'}
          • 1 ceiling shot{'\n'}
          • 1 floor shot{'\n'}
          • 2-4 corner shots (where walls meet)
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📐 Camera Position</Text>
        <Text style={styles.cardBody}>
          Hold your phone at chest height (~4-5 feet). Angle slightly to capture
          both the wall and adjacent floor/ceiling in each shot.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔄 Overlap</Text>
        <Text style={styles.cardBody}>
          Each image should overlap ~30% with the previous one. This helps the AI
          stitch the room together accurately.
        </Text>
      </View>

      <View style={styles.cardWarning}>
        <Text style={styles.cardTitle}>⚠️ Avoid</Text>
        <Text style={styles.cardBody}>
          • Motion blur (hold steady){'\n'}
          • Extreme backlighting (don't shoot into windows){'\n'}
          • Standing too close to walls{'\n'}
          • Very low light conditions
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📏 Minimum Quality</Text>
        <Text style={styles.cardBody}>
          Images must be at least 480×480 pixels.{'\n'}
          Supported formats: JPEG, PNG, HEIC.
        </Text>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
        <Text style={styles.primaryBtnText}>Got it — Start Capturing</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0a0a0f' },
  container: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: '#e0e0e8', marginBottom: 4, marginTop: 20 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
  card: { backgroundColor: '#161620', borderWidth: 1, borderColor: '#222', borderRadius: 10, padding: 16, marginBottom: 12 },
  cardWarning: { backgroundColor: '#1a1510', borderWidth: 1, borderColor: '#443300', borderRadius: 10, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#e0e0e8', marginBottom: 6 },
  cardBody: { fontSize: 14, color: '#aaa', lineHeight: 21 },
  primaryBtn: { backgroundColor: '#7c8aff', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backBtn: { alignItems: 'center', paddingVertical: 12 },
  backBtnText: { color: '#888', fontSize: 14 },
});
