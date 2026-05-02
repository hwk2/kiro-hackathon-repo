# Requirements — Member 2: Desktop Visualization Engine

**Owner**: Team Member 2
**Platform**: Windows / macOS (Python + PySide6 with OpenGL)
**Focus**: Bluetooth image reception, 3D model rendering, prompt input interface, response comparison UI, and training feedback storage.

This document covers all requirements that Member 2 is responsible for implementing. Refer to the main [requirements.md](requirements.md) for the shared glossary and cross-cutting concerns.

---

## Requirement 5: Image Reception and Forwarding

**User Story:** As a desktop user, I want the desktop application to receive images from the paired mobile device and forward them to the AI pipeline, so that 3D model generation can begin.

### Acceptance Criteria

1. WHEN the Desktop_Visualization_Engine receives an image via Bluetooth_Transfer, THE Desktop_Visualization_Engine SHALL display a thumbnail preview of the received image.
2. WHEN one or more images are received, THE Desktop_Visualization_Engine SHALL forward the images to the AI_Pipeline for processing.
3. WHILE the AI_Pipeline is processing images, THE Desktop_Visualization_Engine SHALL display a processing status indicator to the user.
4. IF the AI_Pipeline is unreachable when images are received, THEN THE Desktop_Visualization_Engine SHALL queue the images and retry forwarding when the AI_Pipeline becomes available.
5. ALL received images SHALL be stored locally on the desktop machine only — never uploaded to any external service.

---

## Requirement 8: 3D Model Display

**User Story:** As a desktop user, I want to view the generated 3D model on my desktop application, so that I can inspect the room layout and identified objects.

### Acceptance Criteria

1. WHEN the Desktop_Visualization_Engine receives a Block_Model from the AI_Pipeline, THE Desktop_Visualization_Engine SHALL render the Block_Model in an interactive 3D viewport.
2. THE Desktop_Visualization_Engine SHALL allow the user to rotate, zoom, and pan the 3D viewport.
3. WHEN the user selects a block in the 3D viewport, THE Desktop_Visualization_Engine SHALL display the Object_Category label, Confidence_Score, and text description for the selected block.
4. THE Desktop_Visualization_Engine SHALL visually distinguish blocks with a Confidence_Score below 0.5 from blocks with a Confidence_Score at or above 0.5.
5. THE Desktop_Visualization_Engine SHALL run on both Windows and macOS operating systems.

---

## Requirement 9: Room Manipulation via Prompts (Desktop Only)

**User Story:** As a desktop user, I want to enter natural language prompts to modify the room, so that I can explore design changes such as making the room safer for children or more accessible for the elderly.

### Acceptance Criteria

1. THE Desktop_Visualization_Engine SHALL provide a text input field where the user can enter a Manipulation_Prompt. Prompt generation occurs exclusively on the desktop client.
2. WHEN the user submits a Manipulation_Prompt, THE Desktop_Visualization_Engine SHALL forward the prompt along with the current Block_Model to the AI_Pipeline.
3. WHEN the AI_Pipeline receives a Manipulation_Prompt and Block_Model, THE AI_Pipeline SHALL generate at least 2 and at most 5 Response_Option entries for the requested modification.
4. WHEN Response_Option entries are generated, THE AI_Pipeline SHALL include a modified Block_Model and a text description of the proposed changes for each Response_Option.
5. WHEN the Desktop_Visualization_Engine receives Response_Option entries, THE Desktop_Visualization_Engine SHALL display all options side by side with their text descriptions so the user can compare them.
6. WHEN the user selects a Response_Option, THE Desktop_Visualization_Engine SHALL apply the selected modified Block_Model to the 3D viewport.

---

## Requirement 11: User Selection Feedback Loop (Local Only)

**User Story:** As a team member, I want to capture which response option the user selects as local training data, so that the selection data can optionally be used to improve future AI outputs without ever leaving the user's machine.

### Acceptance Criteria

1. WHEN the user selects a Response_Option, THE Desktop_Visualization_Engine SHALL record the Training_Feedback including the original Manipulation_Prompt, all generated Response_Option entries, and the index of the selected option.
2. THE Desktop_Visualization_Engine SHALL store Training_Feedback locally on the desktop machine only.
3. Training_Feedback SHALL NOT be transmitted to any external service, cloud storage, or third-party API under any circumstances.
4. WHEN the user dismisses all Response_Option entries without selecting one, THE Desktop_Visualization_Engine SHALL record a Training_Feedback entry indicating that no option was selected.
5. THE user SHALL be able to view, export, and delete their local Training_Feedback data at any time.

---

## Shared Requirement: Bluetooth Server (Desktop Side)

**Note**: This is the desktop side of the Bluetooth protocol shared with Member 1 (Mobile).

### Acceptance Criteria

1. THE Desktop_Visualization_Engine SHALL advertise itself over Bluetooth so that Mobile_App instances can discover it.
2. WHEN a pairing request is received, THE Desktop_Visualization_Engine SHALL display the mobile device name and prompt the desktop user to confirm pairing.
3. WHEN pairing is confirmed, THE Desktop_Visualization_Engine SHALL establish an encrypted Bluetooth connection using ECDH key exchange and AES-256-GCM.
4. WHEN image data is received, THE Desktop_Visualization_Engine SHALL verify the SHA-256 checksum and send a `transfer_ack` message back to the Mobile_App.
5. IF a checksum mismatch is detected, THE Desktop_Visualization_Engine SHALL send a `transfer_ack` with status `checksum_mismatch` to trigger re-transmission.

---

## Shared Requirement: Data Privacy and Local-Only Storage (Desktop Portion)

1. ALL images received by the Desktop_Visualization_Engine SHALL be stored locally on the desktop machine only.
2. ALL Training_Feedback SHALL be stored locally on the desktop machine only.
3. ALL Block_Model data SHALL be stored locally on the desktop machine only.
4. THE Desktop_Visualization_Engine SHALL NOT require any user account, login, or registration.
5. WHEN an external AI agent API is configured, THE system SHALL clearly inform the user that image data will be sent to the configured API endpoint.
