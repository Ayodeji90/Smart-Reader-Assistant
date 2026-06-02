# Smart Reader Assistant

A web-based assistive reading tool for visually impaired users. Captures or uploads images of printed text, extracts the text using OCR, and reads it aloud using Text-to-Speech.

## Features

- 📷 **Camera Capture** — Use your device's camera to capture printed text
- 📁 **Image Upload** — Drag-and-drop or browse to upload images
- 🔍 **OCR Processing** — Tesseract-powered text extraction with image preprocessing
- 🔊 **Text-to-Speech** — Natural voice output via Google TTS (gTTS)
- ⏯️ **Audio Controls** — Play, pause, stop, replay, and speed control
- 📥 **Download & Copy** — Save or copy extracted text
- ♿ **Accessible** — WCAG 2.1 compliant with keyboard navigation and ARIA support

## Tech Stack

- **Backend**: Python, FastAPI, OpenCV, Tesseract OCR, gTTS
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Deployment**: Docker, Render.com

## Local Development

### Prerequisites
- Python 3.10+
- Tesseract OCR (`sudo apt install tesseract-ocr`)
- ffmpeg (`sudo apt install ffmpeg`)

### Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 in your browser.

## Deployment (Render.com)

1. Push this repository to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New > Web Service**
4. Connect your GitHub repo
5. Render will auto-detect the `render.yaml` configuration
6. Click **Deploy**

The app will be live at `https://smart-reader-assistant.onrender.com`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Serve frontend |
| POST | `/api/ocr` | Extract text from image |
| POST | `/api/tts` | Convert text to speech (MP3) |
| POST | `/api/text/download` | Download text as .txt file |
| GET | `/api/health` | Health check |
