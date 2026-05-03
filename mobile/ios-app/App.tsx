import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from './src/screens/HomeScreen';
import CaptureGuideScreen, { CAPTURE_GUIDE_DISMISSED_KEY } from './src/screens/CaptureGuideScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import PairingScreen from './src/screens/PairingScreen';
import type { DiscoveredDevice } from './src/utils/bleScanner';
import { INITIAL_CONNECTION_STATE, type ConnectionState } from './src/utils/bleConnectionManager';

export type Screen = 'home' | 'guide' | 'capture' | 'review' | 'pairing';

export interface CapturedImage {
  uri: string;
  width: number;
  height: number;
  fileName: string;
  fileSize?: number;
  capturedAt: string;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(INITIAL_CONNECTION_STATE);

  useEffect(() => {
    AsyncStorage.getItem(CAPTURE_GUIDE_DISMISSED_KEY)
      .then(value => {
        if (value === 'true') {
          setGuideDismissed(true);
        }
      })
      .catch(() => {
        // Storage read failed — default to showing the guide
      });
  }, []);

  const handleStartCapture = useCallback(() => {
    setScreen(guideDismissed ? 'capture' : 'guide');
  }, [guideDismissed]);

  const handleGuideContinue = useCallback(() => {
    setGuideDismissed(true);
    setScreen('capture');
  }, []);

  const addImage = (img: CapturedImage) => {
    setImages(prev => [...prev, img]);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearImages = () => {
    setImages([]);
    setScreen('home');
  };

  const handleDeviceSelected = useCallback((device: DiscoveredDevice) => {
    setSelectedDevice(device);
    setScreen('home');
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {screen === 'home' && (
        <HomeScreen
          imageCount={images.length}
          onStartCapture={handleStartCapture}
          onViewImages={() => setScreen('review')}
          onPairDesktop={() => setScreen('pairing')}
          connectionState={connectionState}
        />
      )}
      {screen === 'guide' && (
        <CaptureGuideScreen
          onContinue={handleGuideContinue}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'capture' && (
        <CaptureScreen
          images={images}
          onAddImage={addImage}
          onDone={() => setScreen('review')}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'review' && (
        <ReviewScreen
          images={images}
          onRemoveImage={removeImage}
          onClearAll={clearImages}
          onAddMore={() => setScreen('capture')}
          onBack={() => setScreen('home')}
          isPaired={selectedDevice !== null}
          onPairDesktop={() => setScreen('pairing')}
        />
      )}
      {screen === 'pairing' && (
        <PairingScreen
          onDeviceSelected={handleDeviceSelected}
          onBack={() => setScreen('home')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
});
