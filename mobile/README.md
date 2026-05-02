# Room Vision AI — Mobile App (Member 1)

Cross-platform mobile application for image capture, validation, and encrypted Bluetooth transfer.

## Structure

```
mobile/
├── android/              # Android-specific code
│   └── app/
│       └── src/main/
│           ├── java/com/roomvision/
│           │   ├── capture/       # Camera and gallery capture
│           │   ├── guide/         # Capture guide UI
│           │   ├── bluetooth/     # BLE discovery, pairing, RFCOMM transfer
│           │   ├── transfer/      # Transfer manager, encryption, checksums
│           │   ├── storage/       # Local image and metadata storage
│           │   └── models/        # Shared data models
│           └── res/
├── ios/                  # iOS-specific code
│   └── RoomVision/
│       ├── Capture/
│       ├── Guide/
│       ├── Bluetooth/
│       ├── Transfer/
│       ├── Storage/
│       └── Models/
├── shared/               # Shared protocol definitions and models
│   ├── protocol.json     # Bluetooth protocol schema v1.0
│   └── models.json       # Shared data model schemas
└── README.md
```

## Setup

See [tasks-member1-mobile.md](../.kiro/specs/room-vision-ai/tasks-member1-mobile.md) for implementation tasks.
See [requirements-member1-mobile.md](../.kiro/specs/room-vision-ai/requirements-member1-mobile.md) for requirements.
