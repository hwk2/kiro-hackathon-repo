---
inclusion: fileMatch
fileMatchPattern: "mobile/**"
---

# Mobile Development Guide

## Framework
Expo (React Native) with TypeScript. iOS-first, Android later.

## Running the App
```bash
cd mobile/ios-app
npm install
npx expo start
```
Scan the QR code with your iPhone camera to open in Expo Go.

## Screen Flow
1. **HomeScreen** → entry point, "Start Capture" button
2. **CaptureGuideScreen** → instructions on how to photograph a room
3. **CaptureScreen** → camera/gallery capture with progress bar (min 4, recommended 8-12)
4. **ReviewScreen** → image grid, remove individual images, transfer to desktop

## Image Validation Rules
- Minimum resolution: 480×480 pixels
- Accepted formats: JPEG, PNG, HEIC
- Images below minimum are rejected with a user-facing alert

## Key Packages
- `expo-image-picker` — camera and gallery access
- `expo-camera` — direct camera control (for future use)
- `expo-file-system` — local file operations

## Adding New Screens
1. Create the component in `src/screens/NewScreen.tsx`
2. Add the screen name to the `Screen` type union in `App.tsx`
3. Add state and navigation logic in `App.tsx`
4. Update this steering doc and the mobile README

## Bluetooth (Upcoming)
Will use `react-native-ble-plx` or `expo-bluetooth` (when available) for BLE discovery/pairing, and a custom RFCOMM bridge for bulk transfer. AES-256-GCM encryption via `expo-crypto`.
