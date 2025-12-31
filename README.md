
# AI Screen Recorder + Transcriber

A minimalist, local-first utility for high-quality screen capture, webcam overlays, and automated transcription. Designed for content creators building tutorials or shorts.

## Vision
To provide a private, high-performance recording environment that respects user data. By leveraging local-first technologies like IndexedDB, WebAudio, and WebAssembly (FFmpeg), we eliminate the need for cloud uploads for processing, giving you full control over your media.

## Feature List
- **Local-First Recording**: Everything stays in your browser. No cloud uploads.
- **Smart Layouts**: 
  - **Circle Overlay**: Draggable circular webcam over your screen.
  - **9:16 Shorts**: Vertical layout with screen on top and webcam on bottom.
- **System + Mic Audio**: Mixed locally using WebAudio API.
- **High Quality**: Supports 720p/1080p at 30/60fps.
- **In-Browser Conversion**: Convert WebM to MP4 and extract MP3 using FFmpeg.wasm.
- **AI Transcription**: Integrated OpenAI Whisper support and local server options.
- **Library Management**: Persistent local storage using IndexedDB.
- **Full ZIP Export**: Download a timestamped bundle containing video, audio, transcript, and metadata.

## Tech Stack
- **React 18** (TypeScript)
- **Tailwind CSS** (Minimalist B&W UI)
- **FFmpeg.wasm** (Client-side video processing)
- **JSZip** (Bundled exports)
- **IndexedDB** (Local storage)
- **WebAudio API** (Audio mixing)

## Quick Start
1. Open the application in a modern desktop browser (Chrome/Edge/Brave).
2. Allow Camera, Microphone, and Screen Capture permissions when prompted.
3. Configure your layout and quality.
4. Hit **Start Recording**.
5. Stop, Preview, and Export as a ZIP.

## Offline Whisper Setup

### A) CLI Guide (Windows)
1. Install Python 3.11+. Ensure "Add Python to PATH" is checked.
2. Install FFmpeg: `choco install ffmpeg` or download binaries and add to PATH.
3. Install Whisper: `pip install -U openai-whisper`
4. Run: `whisper "audio.mp3" --model medium --output_format txt,srt`

### B) Local Server Guide
1. Navigate to `/tools/offline_whisper_server`.
2. Run `pip install -r requirements.txt`.
3. Run `python server.py`.
4. Point the app to `http://localhost:8765`.

## License
MIT License. Copyright (c) 2025 Solomon Christ (www.solomonchrist.com).

---
**Created by Solomon Christ**
[Solomon Christ Website](https://www.solomonchrist.com) | [AI Brief Substack](https://solomonchristai.substack.com/)
