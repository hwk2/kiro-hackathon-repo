/**
 * TransferProgressView — displays batch image transfer progress over BLE.
 *
 * Shows an overall progress bar with percentage, current image status
 * (sending / sent / failed), and an optional cancel button. When the
 * transfer completes, a "Transfer complete" message replaces the
 * per-image status line.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { TransferProgress } from '../utils/bleTransferManager';

interface Props {
  progress: TransferProgress;
  onCancel?: () => void;
}

/** Map image status to a human-readable label, icon, and color. */
function getStatusDisplay(status: TransferProgress['currentImageStatus']): {
  icon: string;
  label: string;
  color: string;
} {
  switch (status) {
    case 'sending':
      return { icon: '📡', label: 'Sending', color: '#7c8aff' };
    case 'sent':
      return { icon: '✅', label: 'Sent', color: '#44aa44' };
    case 'failed':
      return { icon: '❌', label: 'Failed', color: '#cc4444' };
    case 'pending':
    default:
      return { icon: '⏳', label: 'Pending', color: '#888' };
  }
}

export default function TransferProgressView({ progress, onCancel }: Props) {
  const percentage = Math.round(progress.overallProgress * 100);
  const { icon, label, color } = getStatusDisplay(progress.currentImageStatus);

  return (
    <View style={styles.container} testID="transfer-progress-view">
      {/* Overall progress */}
      <Text style={styles.percentageText} testID="overall-percentage">
        {percentage}% complete
      </Text>

      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${percentage}%` },
          ]}
          testID="progress-bar-fill"
        />
      </View>

      {/* Current image status */}
      {progress.complete ? (
        <Text style={styles.completeText} testID="transfer-complete">
          Transfer complete
        </Text>
      ) : (
        <View style={styles.statusRow}>
          <Text style={styles.imageInfoText} testID="image-info">
            Sending image {progress.currentImageIndex + 1} of{' '}
            {progress.totalImages}...
          </Text>
          <Text style={[styles.statusText, { color }]} testID="image-status">
            {icon} {label}
          </Text>
        </View>
      )}

      {/* Cancel button */}
      {onCancel && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          testID="cancel-button"
          accessibilityRole="button"
          accessibilityLabel="Cancel transfer"
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161620',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  percentageText: {
    color: '#e0e0e8',
    fontSize: 16,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#222',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#7c8aff',
    borderRadius: 4,
  },
  statusRow: {
    gap: 4,
  },
  imageInfoText: {
    color: '#e0e0e8',
    fontSize: 14,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  completeText: {
    color: '#44aa44',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cc4444',
    marginTop: 4,
  },
  cancelBtnText: {
    color: '#cc4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
