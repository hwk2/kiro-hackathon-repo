# Tasks — Member 1: Mobile App

**Owner**: Team Member 1
**Requirements**: [requirements-member1-mobile.md](requirements-member1-mobile.md)
**Design Reference**: [design.md](design.md) — Component 1: Mobile App

---

## 1. Project Setup and Scaffolding

- [ ] 1.1 Initialize mobile project (Kotlin Multiplatform or separate Android/iOS native projects)
- [ ] 1.2 Set up build configurations for Android (minSdk, permissions for Bluetooth, camera, storage)
- [ ] 1.3 Set up build configurations for iOS (Info.plist for Bluetooth, camera, photo library permissions)
- [ ] 1.4 Create shared data models for ImageMetadata (filename, format, width, height, captured_at, file_size_bytes)
- [ ] 1.5 Set up local storage layer for images and metadata (Android: Room/SQLite, iOS: CoreData/FileManager)

## 2. Image Capture — Camera

- [ ] 2.1 Implement camera launch flow (Android: CameraX/Intent, iOS: UIImagePickerController/AVCaptureSession)
- [ ] 2.2 Capture photo and return image data to the app
- [ ] 2.3 Extract image metadata (dimensions, format, file size) from captured photo
- [ ] 2.4 Validate image resolution is at least 480x480 pixels; reject with user-facing error message if below
- [ ] 2.5 Store validated image locally with generated ImageMetadata JSON

## 3. Image Capture — Gallery/File Import

- [ ] 3.1 Implement gallery picker (Android: MediaStore/SAF, iOS: PHPickerViewController)
- [ ] 3.2 Support multi-image selection from gallery
- [ ] 3.3 Implement file manager import for images from other apps or file sources
- [ ] 3.4 Support JPEG, PNG, and HEIC formats; reject unsupported formats with user-facing message
- [ ] 3.5 Validate resolution (≥480x480) for each imported image
- [ ] 3.6 Store validated images locally with ImageMetadata

## 4. Capture Guide UX

- [ ] 4.1 Design Capture Guide screen layout with visual diagram of recommended camera positions
- [ ] 4.2 Create visual diagram asset showing a top-down room view with numbered camera positions (4 walls, ceiling, floor, corners)
- [ ] 4.3 Implement Capture Guide screen with instructions: minimum 4 images, recommended 8-12, chest height, 30% overlap
- [ ] 4.4 Implement warnings list: avoid motion blur, backlighting, obstructed views, low light
- [ ] 4.5 Implement "dismiss for future sessions" toggle with local persistence
- [ ] 4.6 Implement capture progress indicator showing images captured vs. recommended minimum
- [ ] 4.7 Implement warning dialog when user attempts to proceed with fewer than 4 images
- [ ] 4.8 Wire Capture Guide to display before first image capture in the flow

## 5. Bluetooth Pairing — Discovery and Connection

- [ ] 5.1 Implement Bluetooth permission request flow (Android: BLUETOOTH_CONNECT, BLUETOOTH_SCAN; iOS: CBCentralManager authorization)
- [ ] 5.2 Implement BLE scanning to discover nearby Desktop_Visualization_Engine instances advertising the Room Vision AI service UUID
- [ ] 5.3 Display discovered desktop devices with device name in a list UI
- [ ] 5.4 Implement pairing confirmation dialog showing the desktop device name
- [ ] 5.5 Implement ECDH key exchange during Bluetooth pairing handshake to derive AES-256-GCM encryption key
- [ ] 5.6 Persist pairing information locally (device ID, encryption key) so re-pairing is not needed on reconnect
- [ ] 5.7 Implement connection status display (connected, disconnected, reconnecting)
- [ ] 5.8 Implement auto-reconnect logic: up to 3 attempts at 5-second intervals on connection loss
- [ ] 5.9 Implement failure notification after 3 failed reconnect attempts with option to re-initiate pairing
- [ ] 5.10 Implement unpair action: terminate connection and remove stored pairing data

## 6. Encrypted Image Transfer

- [ ] 6.1 Implement Bluetooth Classic (RFCOMM) connection for bulk image transfer after BLE pairing
- [ ] 6.2 Implement AES-256-GCM encryption of image data before transmission
- [ ] 6.3 Implement the Bluetooth protocol message envelope (protocol_version, message_type, timestamp, payload) per design spec
- [ ] 6.4 Implement `image_transfer` message: serialize image bytes to base64, include ImageMetadata and SHA-256 checksum in payload
- [ ] 6.5 Implement sequential transfer for multiple images with per-image progress tracking
- [ ] 6.6 Implement transfer progress UI showing percentage for current image and overall batch progress
- [ ] 6.7 Implement `transfer_ack` message handling: verify checksum match from desktop response
- [ ] 6.8 Implement auto-retry on checksum mismatch (up to 2 retries per image)
- [ ] 6.9 Implement failure notification after 2 failed retries with manual retry option
- [ ] 6.10 Implement protocol version validation: reject and display error if desktop responds with unsupported version

## 7. Integration and Testing

- [ ] 7.1 End-to-end test: capture image → validate → pair → transfer → verify checksum on desktop side
- [ ] 7.2 Test gallery import with JPEG, PNG, and HEIC formats on both Android and iOS
- [ ] 7.3 Test rejection of images below 480x480 resolution
- [ ] 7.4 Test Bluetooth pairing with Windows and macOS desktop instances
- [ ] 7.5 Test auto-reconnect behavior on Bluetooth connection loss
- [ ] 7.6 Test transfer of 8-12 images sequentially with progress tracking
- [ ] 7.7 Test Capture Guide dismissal persistence across app restarts
- [ ] 7.8 Verify no data is stored outside local device storage (no network calls, no cloud writes)
