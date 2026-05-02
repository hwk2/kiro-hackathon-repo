# Requirements Document

## Introduction

Room Vision AI is an expandable, open-source computer vision application built by a three-person team. The system allows users to capture room images via a mobile device (Android or iOS), transfer them to a paired desktop computer over an encrypted Bluetooth connection, and have an AI model generate a 3D block-based model of the room. Each detected object is represented with general geometric blocks, text descriptions, and confidence ratings.

The system emphasizes fine-grained detection of architectural and safety-relevant features (lights, wall fixtures, power outlets, stairs, handrails, etc.) to enable the core feature: prompt-based room manipulation. Users can enter natural language prompts on the desktop client to modify the room — for example, making it safer for young children or more accessible for the elderly. The system generates multiple response options and lets the user pick the best one, with selections stored locally for optional future training.

**Privacy-first design**: No user data is stored outside the local environment. Device pairing uses Bluetooth — no accounts, no cloud storage, no telemetry.

**Open-source and expandable**: The project is open source. Users can swap in their own AI agent, create plug-in features, and extend the object category registry.

### Team Responsibilities

| Team Member | Focus Area | Key Deliverables |
|-------------|-----------|------------------|
| **Member 1 (You)** | Mobile App | Image capture, Bluetooth pairing, encrypted transfer, capture guide UX |
| **Member 2** | Desktop Visualization Engine | 3D rendering, prompt input interface, response comparison UI |
| **Member 3** | AI & Asset Pipeline | Object detection, 3D model generation, prompt processing, plugin system |

## Glossary

- **Mobile_App**: The mobile application (Android and iOS) responsible for capturing or importing room images and transferring them to the paired Desktop_Visualization_Engine over Bluetooth.
- **Desktop_Visualization_Engine**: The Windows/Mac desktop application that receives images, displays generated 3D models, and provides the prompt interface for room manipulation.
- **AI_Pipeline**: The AI and asset processing module that performs object detection, generates 3D block-based models, assigns confidence scores, and processes room manipulation prompts. For the demo, this uses a free/low-cost AI agent (e.g., a local model via Ollama, or a free-tier API like Gemini). The architecture allows users to swap in any compatible AI agent.
- **Bluetooth_Transfer**: The encrypted Bluetooth connection used to transmit images and data between the Mobile_App and the Desktop_Visualization_Engine. No network or cloud services are involved.
- **Block_Model**: A 3D representation of a room composed of general geometric blocks, where each block corresponds to a detected object or structural element.
- **Confidence_Score**: A numerical value between 0.0 and 1.0 representing the AI_Pipeline's certainty that a detected object has been correctly identified and classified.
- **Manipulation_Prompt**: A natural language instruction provided by the user through the Desktop_Visualization_Engine to request modifications to the room's 3D model.
- **Response_Option**: One of multiple generated proposals for how to fulfill a Manipulation_Prompt, each containing a modified Block_Model and a text description of the changes.
- **Object_Category**: A classification label for a detected item in a room image (e.g., light fixture, power outlet, staircase, handrail, wall fixture).
- **Category_Registry**: The extensible catalog of all supported Object_Category entries, manipulation rules, and prompt types. Supports user-created plugins.
- **Training_Feedback**: The data captured when a user selects a preferred Response_Option. Stored locally only — never transmitted externally.
- **Capture_Guide**: The in-app instructions that guide the user through the image capture process, specifying angles, coverage, and number of images needed.
- **Plugin**: A user-created extension that adds new object categories, manipulation rules, or prompt types to the system without modifying core code.

## Requirements

### Requirement 1: Image Capture and Quality

**User Story:** As a mobile user, I want to capture or import room images from my Android or iOS device with clear quality guidance, so that the AI pipeline can generate an accurate 3D model.

#### Acceptance Criteria

1. WHEN the user selects the camera capture option, THE Mobile_App SHALL open the device camera and allow the user to take a photograph.
2. WHEN the user selects the gallery import option, THE Mobile_App SHALL open the device photo gallery and allow the user to select one or more images.
3. THE Mobile_App SHALL accept images from any source available on the device (camera, gallery, file manager, or other apps) on both Android and iOS.
4. THE Mobile_App SHALL support JPEG, PNG, and HEIC image formats for capture and import.
5. WHEN an image has a resolution below 480x480 pixels, THE Mobile_App SHALL reject the image and display a message stating the minimum resolution requirement.
6. WHEN an image meets the minimum resolution, THE Mobile_App SHALL store the image locally with metadata including timestamp, image dimensions, file format, and file size.
7. THE Mobile_App SHALL NOT store any image data outside the local device storage.

### Requirement 2: Image Capture Guide

**User Story:** As a mobile user, I want clear instructions on how to photograph a room for best results, so that I capture enough images at the right angles for accurate 3D reconstruction.

#### Acceptance Criteria

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

### Requirement 3: Device Pairing via Bluetooth

**User Story:** As a mobile user, I want to pair my mobile device with a desktop computer over Bluetooth without creating an account, so that I can transfer images locally and privately.

#### Acceptance Criteria

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

### Requirement 4: Encrypted Image Transfer over Bluetooth

**User Story:** As a mobile user, I want to transfer captured images to the paired desktop over an encrypted Bluetooth connection, so that my images remain private and never leave the local environment.

#### Acceptance Criteria

1. WHEN the user initiates image transfer, THE Bluetooth_Transfer SHALL transmit the selected images from the Mobile_App to the paired Desktop_Visualization_Engine.
2. ALL data transmitted via Bluetooth_Transfer SHALL be encrypted using AES-256 or equivalent encryption before transmission.
3. NO image data SHALL be transmitted over the internet, Wi-Fi, or any network connection — Bluetooth only.
4. WHILE an image transfer is in progress, THE Mobile_App SHALL display a progress indicator showing the percentage of data transferred.
5. WHEN an image transfer completes, THE Bluetooth_Transfer SHALL verify data integrity by comparing checksums between the sent and received image data.
6. IF a checksum mismatch is detected, THEN THE Bluetooth_Transfer SHALL automatically re-transmit the affected image up to 2 times.
7. IF re-transmission fails after 2 attempts, THEN THE Mobile_App SHALL notify the user that the transfer failed and provide an option to retry manually.
8. WHEN multiple images are selected for transfer, THE Bluetooth_Transfer SHALL transmit images sequentially and report individual completion status for each image.
9. THE Bluetooth_Transfer SHALL serialize image metadata (dimensions, format, capture timestamp) alongside the image data using JSON format.

### Requirement 5: Image Reception and Forwarding (Desktop)

**User Story:** As a desktop user, I want the desktop application to receive images from the paired mobile device and forward them to the AI pipeline, so that 3D model generation can begin.

#### Acceptance Criteria

1. WHEN the Desktop_Visualization_Engine receives an image via Bluetooth_Transfer, THE Desktop_Visualization_Engine SHALL display a thumbnail preview of the received image.
2. WHEN one or more images are received, THE Desktop_Visualization_Engine SHALL forward the images to the AI_Pipeline for processing.
3. WHILE the AI_Pipeline is processing images, THE Desktop_Visualization_Engine SHALL display a processing status indicator to the user.
4. IF the AI_Pipeline is unreachable when images are received, THEN THE Desktop_Visualization_Engine SHALL queue the images and retry forwarding when the AI_Pipeline becomes available.
5. ALL received images SHALL be stored locally on the desktop machine only — never uploaded to any external service.

### Requirement 6: Object Detection with Fine Granularity

**User Story:** As a user, I want the AI pipeline to detect and classify objects in room images with fine granularity, including small architectural features, so that the generated 3D model accurately represents the room for safety analysis.

#### Acceptance Criteria

1. WHEN the AI_Pipeline receives a room image, THE AI_Pipeline SHALL detect and classify objects present in the image.
2. THE AI_Pipeline SHALL detect fine-grained objects including but not limited to: light fixtures, wall fixtures, power outlets, light switches, stairs, handrails, door handles, doors, windows, window locks, furniture items, rugs, cords/cables, smoke detectors, fire extinguishers, and sharp-edged furniture.
3. WHEN an object is detected, THE AI_Pipeline SHALL assign a Confidence_Score between 0.0 and 1.0 to each detected object.
4. THE AI_Pipeline SHALL include the bounding box coordinates, Object_Category label, and Confidence_Score for each detected object in the detection output.
5. WHEN a detected object has a Confidence_Score below 0.5, THE AI_Pipeline SHALL flag the object as low-confidence in the detection output.
6. THE AI_Pipeline SHALL retrieve supported Object_Category entries from the Category_Registry during detection.
7. THE AI_Pipeline SHALL use a configurable AI agent. For the demo, a free or low-cost agent SHALL be used (e.g., Ollama with a local vision model, or Gemini free tier). The architecture SHALL allow users to substitute any compatible AI agent by changing a configuration file.

### Requirement 7: 3D Model Generation

**User Story:** As a desktop user, I want the AI pipeline to generate a 3D block-based model from detected room objects, so that I can visualize and manipulate the room in three dimensions.

#### Acceptance Criteria

1. WHEN object detection completes for a room image set, THE AI_Pipeline SHALL generate a Block_Model representing the detected room layout and objects.
2. THE AI_Pipeline SHALL represent each detected object as a geometric block with position, dimensions, rotation, and the associated Object_Category label.
3. THE AI_Pipeline SHALL generate a text description for each block in the Block_Model summarizing the detected object and its spatial context.
4. WHEN multiple images of the same room are provided (as recommended by the Capture_Guide), THE AI_Pipeline SHALL merge detection results into a single unified Block_Model.
5. IF the AI_Pipeline cannot generate a Block_Model due to insufficient image quality or unrecognizable content, THEN THE AI_Pipeline SHALL return a descriptive error message indicating the reason for failure.

### Requirement 8: 3D Model Display (Desktop)

**User Story:** As a desktop user, I want to view the generated 3D model on my desktop application, so that I can inspect the room layout and identified objects.

#### Acceptance Criteria

1. WHEN the Desktop_Visualization_Engine receives a Block_Model from the AI_Pipeline, THE Desktop_Visualization_Engine SHALL render the Block_Model in an interactive 3D viewport.
2. THE Desktop_Visualization_Engine SHALL allow the user to rotate, zoom, and pan the 3D viewport.
3. WHEN the user selects a block in the 3D viewport, THE Desktop_Visualization_Engine SHALL display the Object_Category label, Confidence_Score, and text description for the selected block.
4. THE Desktop_Visualization_Engine SHALL visually distinguish blocks with a Confidence_Score below 0.5 from blocks with a Confidence_Score at or above 0.5.
5. THE Desktop_Visualization_Engine SHALL run on both Windows and macOS operating systems.

### Requirement 9: Room Manipulation via Prompts (Desktop Only)

**User Story:** As a desktop user, I want to enter natural language prompts to modify the room, so that I can explore design changes such as making the room safer for children or more accessible for the elderly.

#### Acceptance Criteria

1. THE Desktop_Visualization_Engine SHALL provide a text input field where the user can enter a Manipulation_Prompt. Prompt generation occurs exclusively on the desktop client.
2. WHEN the user submits a Manipulation_Prompt, THE Desktop_Visualization_Engine SHALL forward the prompt along with the current Block_Model to the AI_Pipeline.
3. WHEN the AI_Pipeline receives a Manipulation_Prompt and Block_Model, THE AI_Pipeline SHALL generate at least 2 and at most 5 Response_Option entries for the requested modification.
4. WHEN Response_Option entries are generated, THE AI_Pipeline SHALL include a modified Block_Model and a text description of the proposed changes for each Response_Option.
5. WHEN the Desktop_Visualization_Engine receives Response_Option entries, THE Desktop_Visualization_Engine SHALL display all options side by side with their text descriptions so the user can compare them.
6. WHEN the user selects a Response_Option, THE Desktop_Visualization_Engine SHALL apply the selected modified Block_Model to the 3D viewport.

### Requirement 10: Safety-Focused Manipulation Rules

**User Story:** As a user, I want the system to apply domain-specific safety rules when processing manipulation prompts, so that suggestions for child safety or elderly accessibility follow established guidelines.

#### Acceptance Criteria

1. WHEN a Manipulation_Prompt references child safety, THE AI_Pipeline SHALL apply child safety rules including covering power outlets, adding corner guards to sharp furniture edges, securing heavy objects that could tip over, and adding child gates near stairs.
2. WHEN a Manipulation_Prompt references elderly accessibility, THE AI_Pipeline SHALL apply accessibility rules including adding handrails near stairs, ensuring adequate lighting, removing trip hazards (rugs, cords), and widening pathways.
3. THE AI_Pipeline SHALL retrieve applicable manipulation rules from the Category_Registry based on the intent of the Manipulation_Prompt.
4. WHEN a Response_Option is generated, THE AI_Pipeline SHALL include a list of the specific safety rules applied in the text description of that Response_Option.

### Requirement 11: User Selection Feedback Loop (Local Only)

**User Story:** As a product team member, I want to capture which response option the user selects as local training data, so that the selection data can optionally be used to improve future AI outputs without ever leaving the user's machine.

#### Acceptance Criteria

1. WHEN the user selects a Response_Option, THE Desktop_Visualization_Engine SHALL record the Training_Feedback including the original Manipulation_Prompt, all generated Response_Option entries, and the index of the selected option.
2. THE Desktop_Visualization_Engine SHALL store Training_Feedback locally on the desktop machine only.
3. Training_Feedback SHALL NOT be transmitted to any external service, cloud storage, or third-party API under any circumstances.
4. THE AI_Pipeline SHALL store Training_Feedback in a structured JSON format suitable for optional local model fine-tuning.
5. WHEN the user dismisses all Response_Option entries without selecting one, THE Desktop_Visualization_Engine SHALL record a Training_Feedback entry indicating that no option was selected.
6. THE user SHALL be able to view, export, and delete their local Training_Feedback data at any time.

### Requirement 12: Expandability — Open Source and Plugin System

**User Story:** As a developer or power user, I want to extend the system with new object categories, manipulation rules, and custom features via plugins, so that the system grows with community contributions.

#### Acceptance Criteria

1. THE project SHALL be open source with a permissive license (MIT or Apache 2.0).
2. THE Category_Registry SHALL support adding new Object_Category entries via plugin files without modifying core code.
3. THE Category_Registry SHALL support adding new manipulation rules via plugin files without modifying core code.
4. THE system SHALL define a Plugin interface specification that allows users to create and install plugins for: new object categories, new manipulation rules, new prompt types, and new AI agent integrations.
5. WHEN a Plugin is installed, THE system SHALL load it at startup and integrate its contributions into the Category_Registry.
6. THE AI_Pipeline SHALL support swapping the underlying AI agent by changing a configuration file. Users who wish to extend the project SHALL be able to use their own AI agent (local or API-based) by implementing the defined agent interface.
7. THE demo SHALL use a free or low-cost AI agent. The README SHALL document how to configure alternative agents.

### Requirement 13: Data Privacy and Local-Only Storage

**User Story:** As a user, I want all my data to remain on my local devices, so that my room images and personal information are never exposed to external services.

#### Acceptance Criteria

1. ALL images captured by the Mobile_App SHALL be stored locally on the mobile device only.
2. ALL images received by the Desktop_Visualization_Engine SHALL be stored locally on the desktop machine only.
3. ALL Training_Feedback SHALL be stored locally on the desktop machine only.
4. ALL Block_Model data SHALL be stored locally on the desktop machine only.
5. NO component of the system SHALL transmit user data (images, models, prompts, feedback) to any external server, cloud service, or third-party API, except for AI agent API calls where the user has explicitly configured an external agent.
6. WHEN an external AI agent API is configured, THE system SHALL clearly inform the user that image data will be sent to the configured API endpoint.
7. THE Mobile_App SHALL NOT require any user account, login, or registration.
8. THE Desktop_Visualization_Engine SHALL NOT require any user account, login, or registration.

### Requirement 14: Cross-Platform Bluetooth Communication Protocol

**User Story:** As a system architect, I want a well-defined Bluetooth communication protocol between the mobile app and desktop engine, so that image transfer works reliably across Android, iOS, Windows, and macOS.

#### Acceptance Criteria

1. THE Bluetooth_Transfer SHALL use Bluetooth Low Energy (BLE) or Bluetooth Classic depending on the image size and platform capabilities.
2. THE Bluetooth_Transfer SHALL use a versioned protocol schema for all messages exchanged between the Mobile_App and Desktop_Visualization_Engine.
3. THE Bluetooth_Transfer SHALL serialize all metadata payloads using JSON format.
4. WHEN a device receives a message with an unrecognized protocol version, THE receiving device SHALL reject the message and return an error indicating the expected version.
5. THE Bluetooth_Transfer SHALL support communication between: Android Mobile_App ↔ Windows Desktop_Visualization_Engine, Android Mobile_App ↔ macOS Desktop_Visualization_Engine, iOS Mobile_App ↔ Windows Desktop_Visualization_Engine, and iOS Mobile_App ↔ macOS Desktop_Visualization_Engine.

### Requirement 15: Block Model Serialization and Round-Trip Integrity

**User Story:** As a developer, I want the Block_Model to be serializable to a standard format and back without data loss, so that models can be reliably stored, transferred, and reconstructed across components.

#### Acceptance Criteria

1. THE AI_Pipeline SHALL serialize Block_Model instances to JSON format for storage and inter-component communication.
2. THE AI_Pipeline SHALL deserialize JSON-formatted Block_Model data back into Block_Model instances.
3. FOR ALL valid Block_Model instances, serializing to JSON and then deserializing back SHALL produce a Block_Model equivalent to the original (round-trip property).
4. WHEN the AI_Pipeline receives malformed JSON that does not conform to the Block_Model schema, THE AI_Pipeline SHALL return a descriptive error identifying the first schema violation encountered.
