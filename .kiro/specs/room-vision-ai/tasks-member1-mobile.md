# Tasks — Member 1: Mobile App

**Owner**: Team Member 1
**Requirements**: [requirements-member1-mobile.md](requirements-member1-mobile.md)
**Design Reference**: [design.md](design.md) — Component 1: Mobile App
**Tech**: Expo (React Native) + TypeScript — iOS-first, no Mac needed

---

## 1. Project Setup and Scaffolding

- [x] 1.1 Initialize mobile project — Expo with TypeScript (blank-typescript template)
- [ ] 1.2 Set up build configurations for Android (deferred — iOS-first approach)
- [x] 1.3 Set up iOS permissions — handled by Expo via expo-image-picker runtime prompts
- [x] 1.4 Create shared data models — CapturedImage interface in App.tsx (uri, width, height, fileName, fileSize, capturedAt)
- [x] 1.5 Set up local storage — using Expo's local file system via image picker URIs

## 2. Image Capture — Camera

- [x] 2.1 Implement camera launch — expo-image-picker launchCameraAsync in CaptureScreen.tsx
- [x] 2.2 Capture photo and return image data to the app
- [x] 2.3 Extract image metadata (dimensions, format, file size) from captured photo
- [x] 2.4 Validate image resolution ≥ 480x480; reject with Alert if below
- [x] 2.5 Store validated image in state with CapturedImage metadata

## 3. Image Capture — Gallery/File Import

- [x] 3.1 Implement gallery picker — expo-image-picker launchImageLibraryAsync
- [x] 3.2 Support multi-image selection (allowsMultipleSelection: true)
- [x] 3.3 Implement file manager import for images from other apps or file sources
- [x] 3.4 Support JPEG, PNG, and HEIC formats via expo-image-picker
- [x] 3.5 Validate resolution (≥480x480) for each imported image
- [x] 3.6 Store validated images with CapturedImage metadata

## 4. Capture Guide UX

- [x] 4.1 Design Capture Guide screen layout — CaptureGuideScreen.tsx with card-based instructions
- [x] 4.3 Implement instructions: minimum 4 images, recommended 8-12, chest height, 30% overlap
- [x] 4.4 Implement warnings: motion blur, backlighting, obstructed views, low light
- [x] 4.5 Implement "dismiss for future sessions" toggle with AsyncStorage persistence
- [x] 4.6 Implement capture progress bar showing images captured vs. recommended 8
- [x] 4.7 Implement warning Alert when proceeding with fewer than 4 images
- [x] 4.8 Wire Capture Guide to display before first capture in the flow

## 5. Bluetooth Pairing — Discovery and Connection

- [x] 5.1 Install and configure react-native-ble-plx for BLE support
- [x] 5.2 Implement Bluetooth permission request flow (iOS: CBCentralManager authorization)
- [x] 5.3 Implement BLE scanning to discover nearby Desktop instances advertising Room Vision AI service UUID
- [x] 5.4 Display discovered desktop devices with device name in a list UI
- [x] 5.5 Implement pairing confirmation dialog showing the desktop device name
- [x] 5.6 Implement ECDH key exchange during pairing to derive AES-256-GCM encryption key
- [x] 5.7 Persist pairing info locally (AsyncStorage) so re-pairing is not needed
- [x] 5.8 Implement connection status display (connected, disconnected, reconnecting)
- [x] 5.9 Implement auto-reconnect: up to 3 attempts at 5-second intervals
- [x] 5.10 Implement failure notification after 3 failed attempts with re-pair option
- [x] 5.11 Implement unpair action: terminate connection and clear stored pairing data

## 6. Encrypted Image Transfer

- [x] 6.1 Implement Bluetooth Classic (RFCOMM) connection for bulk image transfer
- [x] 6.2 Implement AES-256-GCM encryption of image data via expo-crypto
- [x] 6.3 Implement Bluetooth protocol message envelope per design spec
- [x] 6.4 Implement image_transfer message: base64 image + metadata + SHA-256 checksum
- [x] 6.5 Implement sequential transfer for multiple images with per-image progress
- [x] 6.6 Implement transfer progress UI (percentage for current image + overall batch)
- [x] 6.7 Implement transfer_ack handling: verify checksum match from desktop
- [x] 6.8 Implement auto-retry on checksum mismatch (up to 2 retries per image)
- [x] 6.9 Implement failure notification after 2 retries with manual retry option
- [x] 6.10 Implement protocol version validation

## 7. Integration and Testing

- [x] 7.1 End-to-end: capture → validate → pair → transfer → verify checksum
- [x] 7.2 Test gallery import with JPEG, PNG, HEIC on iOS
- [~] 7.3 Test rejection of images below 480x480
- [~] 7.4 Test Bluetooth pairing with Windows and macOS desktop
- [~] 7.5 Test auto-reconnect on Bluetooth connection loss
- [~] 7.6 Test transfer of 8-12 images sequentially
- [~] 7.7 Test Capture Guide dismissal persistence across app restarts
- [~] 7.8 Verify no data stored outside local device (no network calls, no cloud)
