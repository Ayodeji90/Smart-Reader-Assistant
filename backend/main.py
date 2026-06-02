"""
Smart Reader Assistant — Backend API (v2)

A lightweight FastAPI backend that proxies image uploads to OCR.space
for accurate text extraction. TTS is handled client-side via the
browser's built-in SpeechSynthesis API.
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import requests as http_requests
import os
import io

app = FastAPI(
    title="Smart Reader Assistant API",
    description="Assistive reading tool for visually impaired users — OCR pipeline",
    version="2.0.0",
)

# CORS — allow frontend on any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Configuration ──
OCR_API_KEY = os.environ.get("OCR_API_KEY", "K89497956088957")
OCR_API_URL = "https://api.ocr.space/parse/image"

# Resolve paths relative to project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

# Serve frontend static files
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def serve_frontend():
    """Serve the main frontend HTML page."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.post("/api/ocr")
async def extract_text(file: UploadFile = File(...)):
    """
    Receives an image file (from camera capture or file upload),
    forwards it to OCR.space API for text extraction,
    and returns the extracted text.

    OCR.space free tier: 25,000 requests/month, 1MB file limit.
    """
    file_content = await file.read()

    # Validate file size — OCR.space free tier limit is 1MB
    file_size_mb = len(file_content) / (1024 * 1024)
    if file_size_mb > 1.0:
        return {
            "success": False,
            "error": f"Image too large ({file_size_mb:.1f}MB). Maximum is 1MB. Try moving closer to the text.",
            "error_code": "file_too_large",
        }

    try:
        # Forward the image to OCR.space API
        response = http_requests.post(
            OCR_API_URL,
            files={
                "file": (file.filename or "capture.jpg", file_content),
            },
            data={
                "apikey": OCR_API_KEY,
                "language": "eng",
                "isOverlayRequired": False,
                "OCREngine": "2",  # Engine 2 is better for camera photos
                "scale": True,     # Auto-upscale small images
                "isTable": False,
            },
            timeout=30,
        )

        result = response.json()

        # Check for API-level errors
        if result.get("IsErroredOnProcessing"):
            error_messages = result.get("ErrorMessage", ["OCR processing failed."])
            error_msg = error_messages[0] if isinstance(error_messages, list) else str(error_messages)
            return {
                "success": False,
                "error": error_msg,
                "error_code": "ocr_error",
            }

        # Extract text from parsed results
        parsed_results = result.get("ParsedResults", [])
        if not parsed_results:
            return {
                "success": False,
                "error": "No text could be extracted from the image.",
                "error_code": "no_text_found",
            }

        extracted_text = parsed_results[0].get("ParsedText", "").strip()

        if not extracted_text:
            return {
                "success": False,
                "error": "No readable text found. Try better lighting or a clearer image.",
                "error_code": "no_text_found",
            }

        return {"success": True, "text": extracted_text}

    except http_requests.Timeout:
        return {
            "success": False,
            "error": "Text extraction timed out. Please try again.",
            "error_code": "timeout",
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Text extraction failed: {str(e)}",
            "error_code": "ocr_error",
        }


@app.post("/api/text/download")
async def download_text(text: str = Form(...)):
    """Download extracted text as a .txt file."""
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
    return {"status": "healthy", "service": "Smart Reader Assistant", "version": "2.0.0"}
