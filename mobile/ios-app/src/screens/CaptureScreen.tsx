import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { CapturedImage } from '../../App';
import {
  MIN_RESOLUTION,
  MIN_IMAGES,
  RECOMMENDED_IMAGES,
  isValidResolution,
  isSupportedExtension,
  calculateProgress,
  getProgressColor,
  needsMinimumImageWarning,
} from '../utils/imageValidation';

interface Props {
  images: CapturedImage[];
  onAddImage: (img: CapturedImage) => void;
  onDone: () => void;
  onBack: () => void;
}

export default function CaptureScreen({ images, onAddImage, onDone, onBack }: Props) {

  const processResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets) return;

    for (const asset of result.assets) {
      if (!isValidResolution(asset.width, asset.height)) {
        Alert.alert(
          'Image Too Small',
          `Minimum resolution is ${MIN_RESOLUTION}×${MIN_RESOLUTION}px. This image is ${asset.width}×${asset.height}px.`
        );
        continue;
      }

      const img: CapturedImage = {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName || `capture_${Date.now()}.jpg`,
        fileSize: asset.fileSize,
        capturedAt: new Date().toISOString(),
      };
      onAddImage(img);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera access is required to capture room images.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      exif: true,
    });
    processResult(result);
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Photo library access is required to import images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      quality: 0.9,
      exif: true,
    });
    processResult(result);
  };

  const getImageDimensions = (uri: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        (error) => reject(error)
      );
    });
  };

  const pickFromFiles = async () => {
    const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_MIME_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      for (const asset of result.assets) {
        const ext = (asset.name || '').split('.').pop()?.toLowerCase();
        if (ext && !isSupportedExtension(asset.name || '')) {
          Alert.alert('Unsupported Format', `"${asset.name}" is not a supported image format. Use JPEG, PNG, or HEIC.`);
          continue;
        }

        // Get image dimensions since DocumentPicker doesn't provide them
        let width: number;
        let height: number;
        try {
          const dims = await getImageDimensions(asset.uri);
          width = dims.width;
          height = dims.height;
        } catch {
          Alert.alert('Cannot Read Image', `Unable to read dimensions for "${asset.name}". The file may be corrupted.`);
          continue;
        }

        if (!isValidResolution(width, height)) {
          Alert.alert(
            'Image Too Small',
            `Minimum resolution is ${MIN_RESOLUTION}×${MIN_RESOLUTION}px. "${asset.name}" is ${width}×${height}px.`
          );
          continue;
        }

        // Get file info for size
        let fileSize: number | undefined;
        try {
          const fileInfo = await FileSystem.getInfoAsync(asset.uri);
          if (fileInfo.exists && 'size' in fileInfo) {
            fileSize = fileInfo.size;
          }
        } catch {
          // File size is optional metadata — continue without it
        }

        const img: CapturedImage = {
          uri: asset.uri,
          width,
          height,
          fileName: asset.name || `file_import_${Date.now()}.jpg`,
          fileSize: fileSize ?? asset.size,
          capturedAt: new Date().toISOString(),
        };
        onAddImage(img);
      }
    } catch {
      Alert.alert('Import Failed', 'Could not open the file picker. Please try again.');
    }
  };

  const handleDone = () => {
    if (needsMinimumImageWarning(images.length)) {
      Alert.alert(
        'Not Enough Images',
        `You have ${images.length} image(s). We recommend at least ${MIN_IMAGES} for a basic model and ${RECOMMENDED_IMAGES}+ for best results. Continue anyway?`,
        [
          { text: 'Add More', style: 'cancel' },
          { text: 'Continue', onPress: onDone },
        ]
      );
    } else {
      onDone();
    }
  };

  const progress = calculateProgress(images.length);
  const progressColor = getProgressColor(images.length);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Capture Room</Text>

      {/* Progress */}
      <View style={styles.progressSection}>
        <Text style={styles.progressText}>
          {images.length} / {RECOMMENDED_IMAGES} recommended images
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: progressColor }]} />
        </View>
        {needsMinimumImageWarning(images.length) && (
          <Text style={styles.warningText}>⚠️ Minimum {MIN_IMAGES} images needed</Text>
        )}
        {images.length >= RECOMMENDED_IMAGES && (
          <Text style={styles.successText}>✅ Great coverage!</Text>
        )}
      </View>

      {/* Capture buttons */}
      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
          <Text style={styles.captureBtnEmoji}>📷</Text>
          <Text style={styles.captureBtnText}>Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureBtn} onPress={pickFromGallery}>
          <Text style={styles.captureBtnEmoji}>🖼️</Text>
          <Text style={styles.captureBtnText}>From Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureBtn} onPress={pickFromFiles}>
          <Text style={styles.captureBtnEmoji}>📁</Text>
          <Text style={styles.captureBtnText}>From Files</Text>
        </TouchableOpacity>
      </View>

      {/* Done button */}
      <TouchableOpacity
        style={[styles.doneBtn, images.length === 0 && styles.doneBtnDisabled]}
        onPress={handleDone}
        disabled={images.length === 0}
      >
        <Text style={styles.doneBtnText}>
          Review Images ({images.length})
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0a0a0f' },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: '#888', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800', color: '#e0e0e8', marginBottom: 20 },
  progressSection: { marginBottom: 30 },
  progressText: { color: '#aaa', fontSize: 14, marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  warningText: { color: '#cc8800', fontSize: 13, marginTop: 6 },
  successText: { color: '#44aa44', fontSize: 13, marginTop: 6 },
  buttonGroup: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  captureBtn: { flex: 1, backgroundColor: '#161620', borderWidth: 1, borderColor: '#333', borderRadius: 12, padding: 24, alignItems: 'center' },
  captureBtnEmoji: { fontSize: 36, marginBottom: 8 },
  captureBtnText: { color: '#e0e0e8', fontSize: 14, fontWeight: '600' },
  doneBtn: { backgroundColor: '#7c8aff', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  doneBtnDisabled: { opacity: 0.4 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
