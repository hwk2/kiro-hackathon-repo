# Tasks — Member 2: Desktop Visualization Engine

**Owner**: Team Member 2
**Requirements**: [requirements-member2-desktop.md](requirements-member2-desktop.md)
**Design Reference**: [design.md](design.md) — Component 2: Desktop Visualization Engine

---

## 1. Project Setup and Scaffolding

- [ ] 1.1 Initialize Python project with PySide6 for cross-platform desktop UI
- [ ] 1.2 Set up project structure: BluetoothServer, ImageReceiver, AIClient, Viewport3D, PromptInput, ResponseComparison, FeedbackStore modules
- [ ] 1.3 Configure build/packaging for Windows (PyInstaller or cx_Freeze) and macOS (py2app)
- [ ] 1.4 Create shared data models matching the design spec: BlockModel, ImageMetadata, ResponseOption, TrainingFeedback
- [ ] 1.5 Set up local file storage directories for received images, Block_Models, and Training_Feedback

## 2. Bluetooth Server — Pairing and Reception

- [ ] 2.1 Implement Bluetooth advertisement using the Room Vision AI service UUID so mobile devices can discover this desktop
- [ ] 2.2 Implement pairing request handler: display mobile device name, prompt desktop user to confirm
- [ ] 2.3 Implement ECDH key exchange during pairing to derive shared AES-256-GCM encryption key
- [ ] 2.4 Persist pairing information locally for automatic reconnection
- [ ] 2.5 Implement Bluetooth Classic (RFCOMM) listener for bulk image data reception
- [ ] 2.6 Implement protocol message envelope parsing (protocol_version, message_type, timestamp, payload)
- [ ] 2.7 Implement protocol version validation: reject messages with unrecognized version and send error response
- [ ] 2.8 Implement `image_transfer` message handler: decrypt AES-256-GCM data, decode base64, compute SHA-256 checksum
- [ ] 2.9 Implement `transfer_ack` response: send checksum match status back to mobile
- [ ] 2.10 Implement connection status display in the desktop UI (connected, disconnected, waiting for pairing)

## 3. Image Reception and AI Pipeline Forwarding

- [ ] 3.1 Store received images locally with ImageMetadata
- [ ] 3.2 Display thumbnail previews of received images in the UI
- [ ] 3.3 Implement AIClient HTTP module to communicate with AI Pipeline REST API on localhost:8321
- [ ] 3.4 Implement `POST /detect` call: send received images as multipart/form-data with metadata JSON
- [ ] 3.5 Implement processing status indicator while AI Pipeline is working
- [ ] 3.6 Implement image queue: if AI Pipeline is unreachable, queue images and retry when available
- [ ] 3.7 Implement `GET /health` polling to check AI Pipeline availability

## 4. 3D Viewport and Block Model Rendering

- [ ] 4.1 Set up OpenGL 3D viewport widget within PySide6 application
- [ ] 4.2 Implement Block_Model JSON deserialization into renderable 3D objects
- [ ] 4.3 Render each block as a colored geometric box at the specified position, dimensions, and rotation
- [ ] 4.4 Implement camera controls: rotate (mouse drag), zoom (scroll wheel), pan (middle mouse / shift+drag)
- [ ] 4.5 Implement block selection via mouse click (raycasting)
- [ ] 4.6 Implement block detail panel: display Object_Category label, Confidence_Score, and text description on selection
- [ ] 4.7 Implement visual distinction for low-confidence blocks (Confidence_Score < 0.5): different color or transparency
- [ ] 4.8 Implement room boundary rendering (floor, walls as wireframe or translucent planes)
- [ ] 4.9 Add axis indicators and grid for spatial reference

## 5. Prompt Input and Response Comparison

- [ ] 5.1 Implement Manipulation_Prompt text input field in the UI
- [ ] 5.2 Implement prompt submission: send `POST /manipulate` to AI Pipeline with current Block_Model and prompt text
- [ ] 5.3 Implement loading/processing indicator while AI Pipeline generates responses
- [ ] 5.4 Implement Response_Option display: side-by-side cards showing text description and rules applied for each option
- [ ] 5.5 Implement 3D preview toggle: allow user to preview each Response_Option's modified Block_Model in the viewport before committing
- [ ] 5.6 Implement "Select" action on a Response_Option: apply the modified Block_Model to the main viewport
- [ ] 5.7 Implement "Dismiss All" action: close response options without selecting

## 6. Training Feedback Storage

- [ ] 6.1 Implement TrainingFeedback data model matching the design spec JSON schema
- [ ] 6.2 Record Training_Feedback on Response_Option selection: original prompt, all options, selected index
- [ ] 6.3 Record Training_Feedback on dismissal: same data with dismissed=true, selected_option_index=null
- [ ] 6.4 Store Training_Feedback as JSON files in local feedback directory
- [ ] 6.5 Implement feedback viewer: list all stored feedback entries with prompt text and selection
- [ ] 6.6 Implement feedback export: export all feedback as a single JSON file
- [ ] 6.7 Implement feedback deletion: delete individual entries or clear all

## 7. Integration and Testing

- [ ] 7.1 End-to-end test: receive images via Bluetooth → forward to AI Pipeline → render Block_Model → enter prompt → view responses → select → store feedback
- [ ] 7.2 Test Bluetooth pairing with Android and iOS mobile devices
- [ ] 7.3 Test 3D viewport rendering with sample Block_Model JSON
- [ ] 7.4 Test block selection and detail panel display
- [ ] 7.5 Test low-confidence block visual distinction
- [ ] 7.6 Test prompt submission and response display with 2-5 options
- [ ] 7.7 Test feedback recording on selection and dismissal
- [ ] 7.8 Test feedback viewer, export, and deletion
- [ ] 7.9 Verify application runs on both Windows and macOS
- [ ] 7.10 Verify no data leaves the local machine (no outbound network calls except to localhost AI Pipeline)
