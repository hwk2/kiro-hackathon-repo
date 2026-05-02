# Requirements — Member 3: AI & Asset Pipeline

**Owner**: Team Member 3
**Platform**: Runs on desktop host (Python, localhost REST API)
**Focus**: Object detection, 3D block model generation, prompt processing, safety rules, plugin system, and AI agent abstraction.

This document covers all requirements that Member 3 is responsible for implementing. Refer to the main [requirements.md](requirements.md) for the shared glossary and cross-cutting concerns.

---

## Requirement 6: Object Detection with Fine Granularity

**User Story:** As a user, I want the AI pipeline to detect and classify objects in room images with fine granularity, including small architectural features, so that the generated 3D model accurately represents the room for safety analysis.

### Acceptance Criteria

1. WHEN the AI_Pipeline receives a room image, THE AI_Pipeline SHALL detect and classify objects present in the image.
2. THE AI_Pipeline SHALL detect fine-grained objects including but not limited to: light fixtures, wall fixtures, power outlets, light switches, stairs, handrails, door handles, doors, windows, window locks, furniture items, rugs, cords/cables, smoke detectors, fire extinguishers, and sharp-edged furniture.
3. WHEN an object is detected, THE AI_Pipeline SHALL assign a Confidence_Score between 0.0 and 1.0 to each detected object.
4. THE AI_Pipeline SHALL include the bounding box coordinates, Object_Category label, and Confidence_Score for each detected object in the detection output.
5. WHEN a detected object has a Confidence_Score below 0.5, THE AI_Pipeline SHALL flag the object as low-confidence in the detection output.
6. THE AI_Pipeline SHALL retrieve supported Object_Category entries from the Category_Registry during detection.
7. THE AI_Pipeline SHALL use a configurable AI agent. For the demo, a free or low-cost agent SHALL be used (e.g., Ollama with a local vision model, or Gemini free tier). The architecture SHALL allow users to substitute any compatible AI agent by changing a configuration file.

---

## Requirement 7: 3D Model Generation

**User Story:** As a desktop user, I want the AI pipeline to generate a 3D block-based model from detected room objects, so that I can visualize and manipulate the room in three dimensions.

### Acceptance Criteria

1. WHEN object detection completes for a room image set, THE AI_Pipeline SHALL generate a Block_Model representing the detected room layout and objects.
2. THE AI_Pipeline SHALL represent each detected object as a geometric block with position, dimensions, rotation, and the associated Object_Category label.
3. THE AI_Pipeline SHALL generate a text description for each block in the Block_Model summarizing the detected object and its spatial context.
4. WHEN multiple images of the same room are provided (as recommended by the Capture_Guide), THE AI_Pipeline SHALL merge detection results into a single unified Block_Model.
5. IF the AI_Pipeline cannot generate a Block_Model due to insufficient image quality or unrecognizable content, THEN THE AI_Pipeline SHALL return a descriptive error message indicating the reason for failure.

---

## Requirement 10: Safety-Focused Manipulation Rules

**User Story:** As a user, I want the system to apply domain-specific safety rules when processing manipulation prompts, so that suggestions for child safety or elderly accessibility follow established guidelines.

### Acceptance Criteria

1. WHEN a Manipulation_Prompt references child safety, THE AI_Pipeline SHALL apply child safety rules including covering power outlets, adding corner guards to sharp furniture edges, securing heavy objects that could tip over, and adding child gates near stairs.
2. WHEN a Manipulation_Prompt references elderly accessibility, THE AI_Pipeline SHALL apply accessibility rules including adding handrails near stairs, ensuring adequate lighting, removing trip hazards (rugs, cords), and widening pathways.
3. THE AI_Pipeline SHALL retrieve applicable manipulation rules from the Category_Registry based on the intent of the Manipulation_Prompt.
4. WHEN a Response_Option is generated, THE AI_Pipeline SHALL include a list of the specific safety rules applied in the text description of that Response_Option.

---

## Requirement 9 (AI Portion): Prompt Processing and Response Generation

**Note**: The prompt UI is Member 2's responsibility. Member 3 handles the backend processing.

### Acceptance Criteria

1. WHEN the AI_Pipeline receives a Manipulation_Prompt and Block_Model, THE AI_Pipeline SHALL generate at least 2 and at most 5 Response_Option entries for the requested modification.
2. WHEN Response_Option entries are generated, THE AI_Pipeline SHALL include a modified Block_Model and a text description of the proposed changes for each Response_Option.

---

## Requirement 11 (AI Portion): Training Feedback Storage

**Note**: The Desktop_Visualization_Engine records and transmits feedback. Member 3 handles storage format.

### Acceptance Criteria

1. THE AI_Pipeline SHALL store Training_Feedback in a structured JSON format suitable for optional local model fine-tuning.
2. Training_Feedback SHALL NOT be transmitted to any external service under any circumstances.

---

## Requirement 12: Expandability — Open Source and Plugin System

**User Story:** As a developer or power user, I want to extend the system with new object categories, manipulation rules, and custom features via plugins, so that the system grows with community contributions.

### Acceptance Criteria

1. THE project SHALL be open source with a permissive license (MIT or Apache 2.0).
2. THE Category_Registry SHALL support adding new Object_Category entries via plugin files without modifying core code.
3. THE Category_Registry SHALL support adding new manipulation rules via plugin files without modifying core code.
4. THE system SHALL define a Plugin interface specification that allows users to create and install plugins for: new object categories, new manipulation rules, new prompt types, and new AI agent integrations.
5. WHEN a Plugin is installed, THE system SHALL load it at startup and integrate its contributions into the Category_Registry.
6. THE AI_Pipeline SHALL support swapping the underlying AI agent by changing a configuration file. Users who wish to extend the project SHALL be able to use their own AI agent (local or API-based) by implementing the defined agent interface.
7. THE demo SHALL use a free or low-cost AI agent. The README SHALL document how to configure alternative agents.

---

## Requirement 15: Block Model Serialization and Round-Trip Integrity

**User Story:** As a developer, I want the Block_Model to be serializable to a standard format and back without data loss, so that models can be reliably stored, transferred, and reconstructed across components.

### Acceptance Criteria

1. THE AI_Pipeline SHALL serialize Block_Model instances to JSON format for storage and inter-component communication.
2. THE AI_Pipeline SHALL deserialize JSON-formatted Block_Model data back into Block_Model instances.
3. FOR ALL valid Block_Model instances, serializing to JSON and then deserializing back SHALL produce a Block_Model equivalent to the original (round-trip property).
4. WHEN the AI_Pipeline receives malformed JSON that does not conform to the Block_Model schema, THE AI_Pipeline SHALL return a descriptive error identifying the first schema violation encountered.

---

## Shared Requirement: Data Privacy (AI Pipeline Portion)

1. NO component of the AI_Pipeline SHALL transmit user data to any external server, cloud service, or third-party API, except for AI agent API calls where the user has explicitly configured an external agent.
2. WHEN an external AI agent API is configured, THE system SHALL clearly inform the user that image data will be sent to the configured API endpoint.
3. ALL Training_Feedback and Block_Model data processed by the AI_Pipeline SHALL remain on the local machine.
