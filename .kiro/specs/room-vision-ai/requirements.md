# Requirements Document — Room Vision AI

## Introduction

Room Vision AI is an expandable, open-source computer vision application built by a three-person team. The system allows users to capture room images via a mobile device (Android or iOS), transfer them to a paired desktop computer over an encrypted Bluetooth connection, and have an AI model generate a 3D block-based model of the room. Each detected object is represented with general geometric blocks, text descriptions, and confidence ratings.

The system emphasizes fine-grained detection of architectural and safety-relevant features (lights, wall fixtures, power outlets, stairs, handrails, etc.) to enable the core feature: prompt-based room manipulation. Users can enter natural language prompts on the desktop client to modify the room — for example, making it safer for young children or more accessible for the elderly. The system generates multiple response options and lets the user pick the best one, with selections stored locally for optional future training.

**Privacy-first design**: No user data is stored outside the local environment. Device pairing uses Bluetooth — no accounts, no cloud storage, no telemetry.

**Open-source and expandable**: The project is open source. Users can swap in their own AI agent, create plug-in features, and extend the object category registry.

### Team Responsibilities

| Team Member | Focus Area | Key Deliverables |
|-------------|-----------|------------------|
| **Member 1** | Mobile App | Image capture, Bluetooth pairing, encrypted transfer, capture guide UX |
| **Member 2** | Desktop Visualization Engine | 3D rendering, prompt input interface, response comparison UI, feedback storage |
| **Member 3** | AI & Asset Pipeline | Object detection, 3D model generation, prompt processing, plugin system, agent abstraction |

### Requirements by Member

Each team member has a dedicated requirements document covering their subsystem:

- **[requirements-member1-mobile.md](requirements-member1-mobile.md)** — Mobile App (Member 1)
- **[requirements-member2-desktop.md](requirements-member2-desktop.md)** — Desktop Visualization Engine (Member 2)
- **[requirements-member3-ai.md](requirements-member3-ai.md)** — AI & Asset Pipeline (Member 3)

### Shared Requirements

The following requirements apply across all subsystems and are the responsibility of the full team:

- **Requirement 13: Data Privacy and Local-Only Storage** — All components must enforce local-only data storage.
- **Requirement 14: Cross-Platform Bluetooth Communication Protocol** — Shared protocol between Member 1 and Member 2.
- **Requirement 12: Expandability — Open Source and Plugin System** — Architecture-level concern for all members.

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
