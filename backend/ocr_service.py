"""
OCR Service — Image preprocessing and text extraction.

Applies a multi-stage preprocessing pipeline to improve OCR accuracy
on photos taken by mobile cameras, then extracts text using Tesseract.

Pipeline stages (matching Chapter 3 / Figure 3.4):
1. Grayscale conversion
2. Noise reduction (median blur)
3. Contrast enhancement (CLAHE)
4. Adaptive thresholding (binarization)
5. Edge sharpening
6. Tesseract OCR extraction
"""

import cv2
import pytesseract
import numpy as np


def _assess_image_quality(gray_image: np.ndarray) -> dict:
    """
    Assess basic quality metrics of the grayscale image.
    Returns a dict with blur_score and contrast_score.
    """
    # Blur detection using Laplacian variance
    laplacian_var = cv2.Laplacian(gray_image, cv2.CV_64F).var()

    # Contrast assessment using standard deviation
    contrast = gray_image.std()

    return {
        "blur_score": laplacian_var,
        "contrast_score": contrast,
        "is_blurry": laplacian_var < 50,
        "is_low_contrast": contrast < 30,
    }


def _auto_rotate(image: np.ndarray) -> np.ndarray:
    """
    Attempt to auto-correct orientation using Tesseract's OSD.
    Falls back to the original image if detection fails.
    """
    try:
        osd = pytesseract.image_to_osd(image)
        rotation_angle = int([line for line in osd.split('\n') if 'Rotate' in line][0].split(':')[1].strip())
        if rotation_angle == 0:
            return image

        h, w = image.shape[:2]
        center = (w // 2, h // 2)

        rotation_matrix = cv2.getRotationMatrix2D(center, -rotation_angle, 1.0)

        # Calculate new bounding box
        cos = abs(rotation_matrix[0, 0])
        sin = abs(rotation_matrix[0, 1])
        new_w = int(h * sin + w * cos)
        new_h = int(h * cos + w * sin)
        rotation_matrix[0, 2] += (new_w - w) / 2
        rotation_matrix[1, 2] += (new_h - h) / 2

        rotated = cv2.warpAffine(image, rotation_matrix, (new_w, new_h),
                                  flags=cv2.INTER_LINEAR,
                                  borderValue=(255, 255, 255))
        return rotated
    except Exception:
        # If OSD fails, return original
        return image


def process_image_and_extract_text(image_path: str) -> str:
    """
    Reads an image from the given path, applies the full preprocessing pipeline
    to improve OCR accuracy (especially for photos taken by mobile cameras),
    and uses Tesseract to extract the text.

    Pipeline:
      1. Read image
      2. Auto-rotate (orientation correction)
      3. Convert to grayscale
      4. Noise reduction (median blur)
      5. Contrast enhancement (CLAHE)
      6. Adaptive thresholding (binarization)
      7. Edge sharpening
      8. Tesseract OCR

    Returns:
        Extracted and cleaned text string.

    Raises:
        ValueError: If the image cannot be read.
    """
    # 1. Read the image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Could not read the image file.")

    # 2. Auto-rotate if text is sideways or upside-down
    img = _auto_rotate(img)

    # 3. Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Quality assessment (for logging / future use)
    quality = _assess_image_quality(gray)

    # 4. Noise reduction — median blur removes salt-and-pepper noise
    gray = cv2.medianBlur(gray, 3)

    # 5. Contrast enhancement — CLAHE handles non-uniform lighting
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # 6. Adaptive thresholding — binarize for black text on white background
    # Handles shadows and varied lighting from mobile cameras
    thresh = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,
        2
    )

    # 7. Edge sharpening — sharpen text edges for cleaner OCR
    sharpen_kernel = np.array([
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ])
    sharpened = cv2.filter2D(thresh, -1, sharpen_kernel)

    # 8. Optional: morphological operation to clean small artifacts
    kernel = np.ones((1, 1), np.uint8)
    cleaned = cv2.morphologyEx(sharpened, cv2.MORPH_CLOSE, kernel)

    # 9. Extract text using Tesseract
    # --oem 3: Default LSTM engine
    # --psm 3: Fully automatic page segmentation
    custom_config = r'--oem 3 --psm 3'
    extracted_text = pytesseract.image_to_string(cleaned, config=custom_config)

    # Clean up the output string
    # Preserve paragraph structure but clean excessive whitespace
    lines = extracted_text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped:
            cleaned_lines.append(stripped)
        elif cleaned_lines and cleaned_lines[-1] != '':
            cleaned_lines.append('')  # Preserve paragraph breaks

    cleaned_text = '\n'.join(cleaned_lines).strip()

    return cleaned_text
