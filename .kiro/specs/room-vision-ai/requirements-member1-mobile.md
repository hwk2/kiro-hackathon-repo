# Requirements — Member 1: Mobile App

**Owner**: Team Member 1
**Platform**: Android (Kotlin) / iOS (Swift)
**Focus**: Image capture, quality validation, Bluetooth pairing, encrypted image transfer, and capture guide UX.

This document covers all requirements that Member 1 is responsible for implementing. Refer to the main [requirements.md](requirements.md) for the shared glossary and cross-cutting concerns.

---

## Requirement 1: Image Capture and Quality

**User Story:** As a mobile user, I want to capture or import room images from my Android or iOS device with clear quality guidance, so that the AI pipeline can generate an accurate 3D model.

### Acceptance Criteria

1. WHEN the user selects the camera capture option, THE Mobile_App SHALL open the device camera and allow the user to take a photograph.
2. WHEN the user selects the gallery import option, THE Mobile_App SHALL open the device photo gallery and allow the user to select one or more images.
3. THE Mobile_App SHALL accept images from any source available on the device (camera, gallery, file manager, or other apps) on both Android and iOS.
4. THE Mobile_App SHALL support JPEG, PNG, and HEIC image formats for capture and import.
5. WHEN an image has a resolution below 480x480 pixels, THE Mobile_App SHALL reject the image and display a message stating the minimum resolution requirement.
6. WHEN an image meets the minimum resolution, THE Mobile_App SHALL store the image locally with metadata including timestamp, image dimensions, file format, and file size.
7. THE Mobile_App SHALL NOT store any image data outside the local device storage.

---

## Requirement 2: Image Capture Guide

**User Story:** As a mobile user, I want clear instructions on how to photograph a room for best results, so that I capture enough images at the right angles for accurate 3D reconstruction.

### Acceptance Criteria

1. WHEN the user opens the capture flow, THE Mobile_App SHALL display the Capture_Guide before the first image is taken.
2. THE Capture_Guide SHALL instruct the user to capture a minimum of 4 images per room: one from each wall (north, south, east, west facing).
3. THE Capture_Guide SHALL recommend capturing 8-12 images for best results, including: 4 wall-facing shots, 1 ceiling shot, 1 floor shot, and 2-4 corner shots showing where walls meet.
4. THE Capture_Guide SHALL instruct the user to hold the camera at chest height (approximately 4-5 feet) for wall shots, angled slightly to capture both the wall and adjacent floor/ceiling.
5. THE Capture_Guide SHALL instruct the user to ensure each image has at least 30% overlap with an adjacent image to help the AI stitch the room together.
6. THE Capture_Guide SHALL warn the user to avoid: motion blur, extreme backlighting, obstructed views (e.g., standing too close to a wall), and images taken in very low light.
7. THE Capture_Guide SHALL display a visual diagram showing recommended camera positions and angles for a typical rectangular room.
8. WHILE the user is capturing images, THE Mobile_App SHALL display a progress indicator showing how many images have been captured and the recommended minimum remaining.
9. WHEN the user has captured fewer than 4 images and attempts to proceed, THE Mobile_App SHALL display a warning that fewer than the minimum recommended images have been captured and results may be incomplete.
10. THE Capture_Guide SHALL be dismissible so experienced users can skip it on subsequent uses.

---

## Requirement 3: Device Pairing via Bluetooth

**User Story:** As a mobile user, I want to pair my mobile device with a desktop computer over Bluetooth without creating an account, so that I can transfer images locally and privately.

### Acceptance Criteria

1. WHEN the user initiates pairing, THE Mobile_App SHALL discover nearby Desktop_Visualization_Engine instances advertising over Bluetooth.
2. WHEN a Desktop_Visualization_Engine is discovered, THE Mobile_App SHALL display the device name and prompt the user to confirm pairing.
3. WHEN pairing is confirmed on both devices, THE Mobile_App and Desktop_Visualization_Engine SHALL establish an encrypted Bluetooth connection.
4. THE pairing process SHALL NOT require any user account, email address, or cloud service.
5. WHEN a pairing is established, THE Mobile_App SHALL persist the pairing information locally so that subsequent connections do not require re-pairing.
6. WHILE a Bluetooth connection is active, THE Mobile_App SHALL display the connection status (connected, disconnected, reconnecting).
7. IF the Bluetooth connection is lost, THEN THE Mobile_App SHALL attempt to reconnect automatically up to 3 times at 5-second intervals.
8. IF automatic reconnection fails after 3 attempts, THEN THE Mobile_App SHALL notify the user and provide an option to re-initiate pairing.
9. WHEN the user requests to unpair, THE Mobile_App SHALL terminate the connection and remove stored pairing information from both devices.
10. THE Mobile_App SHALL support pairing with Desktop_Visualization_Engine instances running on both Windows and macOS.

---

## Requirement 4: Encrypted Image Transfer over Bluetooth

**User Story:** As a mobile user, I want to transfer captured images to the paired desktop over an encrypted Bluetooth connection, so that my images remain private and never leave the local environment.

### Acceptance Criteria

1. WHEN the user initiates image transfer, THE Bluetooth_Transfer SHALL transmit the selected images from the Mobile_App to the paired Desktop_Visualization_Engine.
2. ALL data transmitted via Bluetooth_Transfer SHALL be encrypted using AES-256 or equivalent encryption before transmission.
3. NO image data SHALL be transmitted over the internet, Wi-Fi, or any network connection — Bluetooth only.
4. WHILE an image transfer is in progress, THE Mobile_App SHALL display a progress indicator showing the percentage of data transferred.
5. WHEN an image transfer completes, THE Bluetooth_Transfer SHALL verify data integrity by comparing checksums between the sent and received image data.
6. IF a checksum mismatch is detected, THEN THE Bluetooth_Transfer SHALL automatically re-transmit the affected image up to 2 times.
7. IF re-transmission fails after 2 attempts, THEN THE Mobile_App SHALL notify the user that the transfer failed and provide an option to retry manually.
8. WHEN multiple images are selected for transfer, THE Bluetooth_Transfer SHALL transmit images sequentially and report individual completion status for each image.
9. THE Bluetooth_Transfer SHALL serialize image metadata (dimensions, format, capture timestamp) alongside the image data using JSON format.

---

## Shared Requirement: Cross-Platform Bluetooth Communication Protocol

**Note**: This requirement is shared with Member 2 (Desktop). Both members must implement their side of this protocol.

**User Story:** As a system architect, I want a well-defined Bluetooth communication protocol between the mobile app and desktop engine, so that image transfer works reliably across Android, iOS, Windows, and macOS.

### Acceptance Criteria

1. THE Bluetooth_Transfer SHALL use Bluetooth Low Energy (BLE) or Bluetooth Classic depending on the image size and platform capabilities.
2. THE Bluetooth_Transfer SHALL use a versioned protocol schema for all messages exchanged between the Mobile_App and Desktop_Visualization_Engine.
3. THE Bluetooth_Transfer SHALL serialize all metadata payloads using JSON format.
4. WHEN a device receives a message with an unrecognized protocol version, THE receiving device SHALL reject the message and return an error indicating the expected version.
5. THE Bluetooth_Transfer SHALL support communication between: Android ↔ Windows, Android ↔ macOS, iOS ↔ Windows, and iOS ↔ macOS.

---

## Shared Requirement: Data Privacy and Local-Only Storage (Mobile Portion)

1. ALL images captured by the Mobile_App SHALL be stored locally on the mobile device only.
2. THE Mobile_App SHALL NOT require any user account, login, or registration.
3. NO component of the Mobile_App SHALL transmit user data to any external server, cloud service, or third-party API.
