/**
 * ConnectionStatusBar — compact status bar showing BLE connection state.
 *
 * Displays a colored dot and a short message reflecting the current
 * connection status. Optionally tappable (e.g. to navigate to pairing).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ConnectionState } from '../utils/bleConnectionManager';
import { getStatusColor, getStatusMessage } from '../utils/bleConnectionManager';

interface Props {
  connectionState: ConnectionState;
  /** Optional tap handler (e.g. navigate to pairing screen). */
  onPress?: () => void;
}

export default function ConnectionStatusBar({ connectionState, onPress }: Props) {
  const color = getStatusColor(connectionState);
  const message = getStatusMessage(connectionState);

  const content = (
    <View style={styles.bar} testID="connection-status-bar">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={message}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161620',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '500',
  },
});
