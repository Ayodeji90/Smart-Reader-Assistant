"""
Smart Reader Assistant — Backend API

A FastAPI application that serves as the backend for the Smart Reader Assistant.
Provides endpoints for:
- OCR text extraction from camera captures and uploaded images
- Text-to-Speech synthesis via gTTS
- Text download
- Static file serving for the frontend
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from .ocr_service import process_image_and_extract_text
from .tts_service import synthesize_speech, cleanup_old_audio, AUDIO_DIR
from .image_validator import validate_image, ImageValidationError
import shutil
import os
import uuid
import io

app = FastAPI(
    title="Smart Reader Assistant API",
    description="Assistive reading tool for visually impaired users — OCR + TTS pipeline",
    version="1.0.0",
)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

# Resolve frontend directory relative to the project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

# Mount frontend static files
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def serve_frontend():
    """Serve the main frontend HTML page."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.post("/api/ocr")
async def extract_text(file: UploadFile = File(...)):
    """
    Receives an image file (from camera capture or file upload),
    validates it, processes it through the OCR pipeline,
    and returns the extracted text.
    """
    # Read file content
    file_content = await file.read()

    # Validate the image
    try:
        validate_image(
            file_content=file_content,
            filename=file.filename or "capture.jpg",
            content_type=file.content_type,
        )
    except ImageValidationError as e:
        return {
            "success": False,
            "error": e.message,
            "error_code": e.code,
        }

    # Save temporarily for OpenCV processing
    temp_filename = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename or 'capture.jpg'}")

    with open(temp_filename, "wb") as buffer:
        buffer.write(file_content)

    try:
        # Process the image and extract text
        extracted_text = process_image_and_extract_text(temp_filename)

        # Clean up temporary file
        os.remove(temp_filename)

        if not extracted_text or not extracted_text.strip():
            return {
                "success": False,
                "error": "No readable text was found in the image. Please try with a clearer image or better lighting.",
                "error_code": "no_text_found",
            }

        return {"success": True, "text": extracted_text}

    except Exception as e:
        # Ensure cleanup on failure
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return {
            "success": False,
            "error": f"Text extraction failed: {str(e)}",
            "error_code": "ocr_error",
        }


@app.post("/api/tts")
async def text_to_speech(
    text: str = Form(...),
    speed: str = Form("normal"),
):
    """
    Convert extracted text to speech using gTTS.

    Args:
        text: The text to synthesize.
        speed: Speech rate — 'slow', 'normal', or 'fast'.

    Returns:
        MP3 audio file as a streaming response.
    """
    try:
        audio_path = synthesize_speech(text=text, speed=speed)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Periodically clean up old cached audio files
    cleanup_old_audio(max_files=100)

    return FileResponse(
        path=audio_path,
        media_type="audio/mpeg",
        filename="smart_reader_audio.mp3",
    )


@app.post("/api/text/download")
async def download_text(text: str = Form(...)):
    """
    Download extracted text as a .txt file.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="No text provided.")

    text_bytes = text.encode("utf-8")
    return StreamingResponse(
        io.BytesIO(text_bytes),
        media_type="text/plain",
        headers={
            "Content-Disposition": "attachment; filename=extracted_text.txt"
        },
    )


@app.get("/api/health")
async def health_check():
    """Health check endpoint for deployment monitoring."""
    return {"status": "healthy", "service": "Smart Reader Assistant"}
