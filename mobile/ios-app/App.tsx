import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import CaptureGuideScreen from './src/screens/CaptureGuideScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ReviewScreen from './src/screens/ReviewScreen';

export type Screen = 'home' | 'guide' | 'capture' | 'review';

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      {screen === 'home' && (
        <HomeScreen
          imageCount={images.length}
          onStartCapture={() => setScreen('guide')}
          onViewImages={() => setScreen('review')}
        />
      )}
      {screen === 'guide' && (
        <CaptureGuideScreen
          onContinue={() => setScreen('capture')}
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
