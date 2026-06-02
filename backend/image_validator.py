"""
Image validation module for the Smart Reader Assistant.

Validates uploaded images for file type, file size, and basic quality
before forwarding to the OCR pipeline.
"""

import os
from typing import Optional
from PIL import Image
import io

# Allowed image MIME types
ALLOWED_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/bmp",
    "image/webp",
}

# Allowed file extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Maximum file size: 10 MB
MAX_FILE_SIZE = 10 * 1024 * 1024

# Minimum image dimensions (pixels)
MIN_WIDTH = 100
MIN_HEIGHT = 100


class ImageValidationError(Exception):
    """Raised when image validation fails."""
    def __init__(self, message: str, code: str):
        self.message = message
        self.code = code
        super().__init__(self.message)


def validate_image(file_content: bytes, filename: str, content_type: Optional[str] = None) -> Image.Image:
    """
    Validate an uploaded image file.

    Args:
        file_content: Raw bytes of the uploaded file.
        filename: Original filename.
        content_type: MIME type from the upload header.

    Returns:
        PIL Image object if validation passes.

    Raises:
        ImageValidationError: If any validation check fails.
    """
    # 1. Check file extension
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ImageValidationError(
            f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            code="invalid_type"
        )

    # 2. Check content type if provided
    if content_type and content_type not in ALLOWED_TYPES:
        raise ImageValidationError(
            f"Unsupported content type '{content_type}'.",
            code="invalid_type"
        )

    # 3. Check file size
    if len(file_content) > MAX_FILE_SIZE:
        size_mb = len(file_content) / (1024 * 1024)
        raise ImageValidationError(
            f"File too large ({size_mb:.1f} MB). Maximum allowed: {MAX_FILE_SIZE // (1024*1024)} MB.",
            code="file_too_large"
        )

    # 4. Verify it's actually a valid image
    try:
        img = Image.open(io.BytesIO(file_content))
        img.verify()
        # Re-open after verify (verify closes the file)
        img = Image.open(io.BytesIO(file_content))
    except Exception:
        raise ImageValidationError(
            "The uploaded file is not a valid image or is corrupted.",
            code="invalid_image"
        )

    # 5. Check minimum dimensions
    width, height = img.size
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        raise ImageValidationError(
            f"Image too small ({width}x{height}). Minimum: {MIN_WIDTH}x{MIN_HEIGHT} pixels.",
            code="image_too_small"
        )

    return img
