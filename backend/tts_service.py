"""
Text-to-Speech Service using gTTS (Google Text-to-Speech).

Converts extracted text into natural-sounding MP3 audio files
with configurable speech rate support.
"""

import os
import uuid
import hashlib
from gtts import gTTS
from pydub import AudioSegment

# Directory for storing generated audio files
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "audio_output")
os.makedirs(AUDIO_DIR, exist_ok=True)

# Speech rate presets (multiplier applied via pydub speed change)
SPEED_PRESETS = {
    "slow": 0.8,
    "normal": 1.0,
    "fast": 1.35,
}


def _text_hash(text: str, speed: str) -> str:
    """Generate a hash for caching: same text+speed = same file."""
    content = f"{text}:{speed}"
    return hashlib.md5(content.encode()).hexdigest()


def _change_speed(audio_path: str, speed: float, output_path: str):
    """
    Change playback speed of an MP3 file using pydub.
    speed > 1.0 = faster, speed < 1.0 = slower.
    """
    if speed == 1.0:
        # No change needed — just copy
        if audio_path != output_path:
            import shutil
            shutil.copy2(audio_path, output_path)
        return

    audio = AudioSegment.from_mp3(audio_path)

    # Change speed by altering frame rate then exporting
    new_frame_rate = int(audio.frame_rate * speed)
    adjusted = audio._spawn(audio.raw_data, overrides={"frame_rate": new_frame_rate})
    adjusted = adjusted.set_frame_rate(audio.frame_rate)

    adjusted.export(output_path, format="mp3")


def synthesize_speech(text: str, speed: str = "normal") -> str:
    """
    Convert text to speech using gTTS and return the path to the MP3 file.

    Args:
        text: The text to convert to speech.
        speed: One of 'slow', 'normal', 'fast'.

    Returns:
        Absolute path to the generated MP3 file.

    Raises:
        ValueError: If text is empty or speed is invalid.
        RuntimeError: If gTTS fails (e.g., no internet connection).
    """
    if not text or not text.strip():
        raise ValueError("Cannot synthesize empty text.")

    speed = speed.lower()
    if speed not in SPEED_PRESETS:
        raise ValueError(f"Invalid speed '{speed}'. Choose from: {list(SPEED_PRESETS.keys())}")

    # Check cache first
    file_hash = _text_hash(text, speed)
    cached_path = os.path.join(AUDIO_DIR, f"{file_hash}.mp3")
    if os.path.exists(cached_path):
        return cached_path

    # Generate base audio with gTTS
    try:
        tts = gTTS(text=text, lang="en", slow=(speed == "slow"))
        base_path = os.path.join(AUDIO_DIR, f"{file_hash}_base.mp3")
        tts.save(base_path)
    except Exception as e:
        raise RuntimeError(f"gTTS synthesis failed: {str(e)}")

    # Apply speed adjustment if needed
    speed_multiplier = SPEED_PRESETS[speed]
    if speed == "slow":
        # gTTS already handles slow mode natively, just rename
        os.rename(base_path, cached_path)
    elif speed_multiplier != 1.0:
        _change_speed(base_path, speed_multiplier, cached_path)
        # Clean up base file
        if os.path.exists(base_path):
            os.remove(base_path)
    else:
        os.rename(base_path, cached_path)

    return cached_path


def cleanup_old_audio(max_files: int = 100):
    """Remove oldest audio files if cache exceeds max_files."""
    files = []
    for f in os.listdir(AUDIO_DIR):
        fpath = os.path.join(AUDIO_DIR, f)
        if os.path.isfile(fpath) and f.endswith(".mp3"):
            files.append((os.path.getmtime(fpath), fpath))

    if len(files) > max_files:
        files.sort()
        for _, fpath in files[: len(files) - max_files]:
            os.remove(fpath)
