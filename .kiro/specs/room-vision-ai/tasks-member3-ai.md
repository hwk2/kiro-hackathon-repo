# Tasks — Member 3: AI & Asset Pipeline

**Owner**: Team Member 3
**Requirements**: [requirements-member3-ai.md](requirements-member3-ai.md)
**Design Reference**: [design.md](design.md) — Component 3: AI Pipeline

---

## 1. Project Setup and Scaffolding

- [x] 1.1 Initialize Python project with FastAPI for the REST API server
- [x] 1.2 Set up project structure: APIServer, ObjectDetector, ModelGenerator, PromptProcessor, AgentInterface, CategoryRegistry, PluginManager, BlockModelSerializer modules
- [x] 1.3 Configure the API server to run on localhost:8321
- [x] 1.4 Create shared data models matching the design spec: BlockModel, DetectionResult, ResponseOption, TrainingFeedback, PluginManifest, AgentConfig
- [x] 1.5 Implement `GET /health` endpoint returning agent name, version, and plugins loaded count

## 2. AI Agent Interface and Configuration

- [x] 2.1 Implement the abstract AgentInterface class with methods: detect_objects(), generate_manipulation(), health_check()
- [x] 2.2 Implement OllamaAgent: adapter for Ollama local models (e.g., llava) implementing AgentInterface
- [x] 2.3 Implement GeminiAgent: adapter for Gemini free-tier API implementing AgentInterface
- [x] 2.4 Implement CustomAgent: loader that imports a user-provided Python module implementing AgentInterface
- [x] 2.5 Implement AgentConfig JSON loader: read agent_config.json to determine which agent to use at startup
- [x] 2.6 Implement agent swap at startup: instantiate the configured agent and inject into ObjectDetector and PromptProcessor
- [x] 2.7 Document agent configuration in README: how to switch between Ollama, Gemini, and custom agents

## 3. Category Registry and Plugin System

- [x] 3.1 Define core categories JSON file (plugins/core/categories.json) with built-in Object_Category entries: light_fixture, wall_fixture, power_outlet, light_switch, stairs, handrail, door_handle, door, window, window_lock, furniture, rug, cord_cable, smoke_detector, fire_extinguisher, sharp_edge_furniture
- [x] 3.2 Define core manipulation rules JSON file (plugins/core/rules.json) with built-in safety rules: cover_outlets, corner_guards, child_gate_stairs, secure_heavy_objects, add_handrails, ensure_lighting, remove_trip_hazards, widen_pathways
- [x] 3.3 Implement CategoryRegistry: load core categories and rules from JSON files
- [x] 3.4 Define PluginManifest JSON schema with fields: plugin_id, name, version, author, categories[], rules[], prompt_types[], agent_config
- [x] 3.5 Implement PluginManager: scan plugins/installed/ directory for manifest.json files
- [x] 3.6 Implement manifest validation: check required fields, validate category and rule schemas
- [x] 3.7 Implement plugin merging: add plugin categories and rules into the CategoryRegistry at startup
- [x] 3.8 Implement graceful error handling: skip invalid plugins with logged warnings, do not crash
- [x] 3.9 Implement `GET /categories` endpoint returning all registered categories (core + plugins)
- [x] 3.10 Implement `GET /rules` endpoint returning all registered manipulation rules (core + plugins)

## 4. Object Detection

- [x] 4.1 Implement `POST /detect` endpoint: accept multipart/form-data with images[] and metadata JSON
- [x] 4.2 Validate incoming images: check format (JPEG/PNG/HEIC), resolution (≥480x480)
- [x] 4.3 Forward images to the configured AI agent via AgentInterface.detect_objects()
- [x] 4.4 Parse agent response into DetectionResult format: category, confidence_score, bounding_box per detection
- [x] 4.5 Flag detections with confidence_score < 0.5 as low_confidence in the output
- [x] 4.6 Validate detected categories against the CategoryRegistry; log warnings for unknown categories
- [x] 4.7 Return detection results with total_objects, low_confidence_count, and categories_detected summary
- [x] 4.8 Implement error response (422) for insufficient image quality or unrecognizable content

## 5. 3D Block Model Generation

- [x] 5.1 Implement ModelGenerator: convert DetectionResult list into a BlockModel
- [x] 5.2 Estimate room dimensions from image set (wall positions, ceiling height) using detection spatial cues
- [x] 5.3 Assign 3D position, dimensions, and rotation to each detected object block based on bounding box and estimated room geometry
- [x] 5.4 Generate text description for each block summarizing the object and its spatial context
- [x] 5.5 Implement multi-image merging: combine detections from multiple images into a single unified BlockModel, deduplicating objects seen from multiple angles
- [x] 5.6 Implement BlockModelSerializer: serialize BlockModel to JSON matching the design spec schema
- [x] 5.7 Implement BlockModelSerializer: deserialize JSON back to BlockModel with schema validation
- [x] 5.8 Implement round-trip integrity: verify serialize → deserialize produces equivalent BlockModel
- [x] 5.9 Implement malformed JSON error handling: return descriptive error identifying the first schema violation

## 6. Prompt Processing and Response Generation

- [x] 6.1 Implement `POST /manipulate` endpoint: accept JSON with session_id, prompt, and block_model
- [x] 6.2 Implement PromptProcessor: parse Manipulation_Prompt to detect intent (child_safety, elderly_accessibility, general_modification, etc.)
- [x] 6.3 Retrieve applicable manipulation rules from CategoryRegistry based on detected intent
- [x] 6.4 Forward prompt, current BlockModel, and applicable rules to the AI agent via AgentInterface.generate_manipulation()
- [x] 6.5 Parse agent response into 2-5 ResponseOption entries, each with a modified BlockModel and text description
- [x] 6.6 Include the list of specific rules applied in each ResponseOption's description
- [x] 6.7 Validate that each ResponseOption contains a valid modified BlockModel
- [x] 6.8 Return ResponseOptions JSON matching the design spec schema
- [x] 6.9 Implement error handling for unparseable prompts: return descriptive error indicating which part could not be interpreted

## 7. Safety Rules Implementation

- [x] 7.1 Implement child safety rule: cover_outlets — identify exposed power_outlet blocks and add outlet cover blocks
- [x] 7.2 Implement child safety rule: corner_guards — identify sharp_edge_furniture blocks and add corner guard blocks
- [x] 7.3 Implement child safety rule: child_gate_stairs — identify stairs blocks and add child gate blocks at entrances
- [x] 7.4 Implement child safety rule: secure_heavy_objects — identify tall/heavy furniture blocks and add wall anchor indicators
- [x] 7.5 Implement elderly accessibility rule: add_handrails — identify stairs blocks and add handrail blocks
- [x] 7.6 Implement elderly accessibility rule: ensure_lighting — identify dark areas and add/upgrade light_fixture blocks
- [x] 7.7 Implement elderly accessibility rule: remove_trip_hazards — identify rug and cord_cable blocks and mark for removal
- [x] 7.8 Implement elderly accessibility rule: widen_pathways — identify narrow passages between furniture blocks and suggest repositioning

## 8. Training Feedback Storage

- [x] 8.1 Implement TrainingFeedback JSON schema matching the design spec
- [x] 8.2 Implement local storage: save TrainingFeedback JSON files to a designated local directory
- [x] 8.3 Ensure no feedback data is transmitted externally under any circumstances
- [x] 8.4 Implement feedback retrieval: load stored feedback for optional local model fine-tuning workflows

## 9. Integration and Testing

- [x] 9.1 End-to-end test: submit test images → detect objects → generate BlockModel → submit prompt → receive ResponseOptions
- [x] 9.2 Test object detection with sample room images containing known objects (outlets, lights, stairs, furniture)
- [x] 9.3 Test BlockModel serialization round-trip integrity
- [x] 9.4 Test malformed JSON rejection with descriptive errors
- [x] 9.5 Test child safety prompt: verify outlet covers, corner guards, child gates appear in ResponseOptions
- [x] 9.6 Test elderly accessibility prompt: verify handrails, lighting, trip hazard removal appear in ResponseOptions
- [x] 9.7 Test plugin loading: install a test plugin and verify its categories and rules appear in /categories and /rules
- [x] 9.8 Test agent swap: switch from Ollama to Gemini via config and verify detection still works
- [x] 9.9 Test with insufficient image quality: verify 422 error response
- [x] 9.10 Verify no data leaves localhost (no outbound network calls except to configured AI agent endpoint)
