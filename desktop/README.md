# Room Vision AI — Desktop Visualization Engine (Member 2)

Cross-platform desktop application for 3D model rendering, prompt-based room manipulation, and Bluetooth image reception.

## Structure

```
desktop/
├── src/
│   ├── main.py                # Application entry point
│   ├── bluetooth/
│   │   ├── __init__.py
│   │   ├── server.py          # BLE advertisement, pairing, RFCOMM listener
│   │   └── protocol.py        # Protocol message parsing and validation
│   ├── receiver/
│   │   ├── __init__.py
│   │   └── image_receiver.py  # Image decryption, checksum verification, local storage
│   ├── ai_client/
│   │   ├── __init__.py
│   │   └── client.py          # HTTP client for AI Pipeline REST API
│   ├── viewport/
│   │   ├── __init__.py
│   │   ├── renderer.py        # OpenGL 3D viewport rendering
│   │   ├── camera.py          # Camera controls (rotate, zoom, pan)
│   │   └── block_inspector.py # Block selection and detail panel
│   ├── prompt/
│   │   ├── __init__.py
│   │   ├── input.py           # Prompt text input widget
│   │   └── response_view.py   # Side-by-side response option display
│   ├── feedback/
│   │   ├── __init__.py
│   │   └── store.py           # Training feedback record, export, delete
│   └── models/
│       ├── __init__.py
│       └── schemas.py         # BlockModel, ImageMetadata, ResponseOption, TrainingFeedback
├── data/
│   ├── images/                # Received images (local only)
│   ├── models/                # Stored BlockModel JSON files
│   └── feedback/              # Training feedback JSON files
├── requirements.txt
└── README.md
```

## Setup

```bash
cd desktop
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
python src/main.py
```

See [tasks-member2-desktop.md](../.kiro/specs/room-vision-ai/tasks-member2-desktop.md) for implementation tasks.
See [requirements-member2-desktop.md](../.kiro/specs/room-vision-ai/requirements-member2-desktop.md) for requirements.
