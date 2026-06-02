/**
 * Smart Reader Assistant — Frontend Application (v2)
 *
 * Handles:
 * - Camera capture (rear camera on mobile)
 * - Image file upload (drag-and-drop + file picker)
 * - OCR text extraction via backend API (OCR.space)
 * - Text-to-Speech via browser's built-in SpeechSynthesis API
 * - Text download and copy
 * - Accessibility: keyboard navigation, ARIA live regions
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── Element References ──
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('captureCanvas');
    const captureBtn = document.getElementById('captureBtn');
    const statusOverlay = document.getElementById('statusOverlay');
    const statusText = document.getElementById('statusText');
    const spinner = document.getElementById('spinner');
    const resultContainer = document.getElementById('resultContainer');
    const resultText = document.getElementById('resultText');
    const processingBar = document.getElementById('processingBar');
    const processingLabel = document.getElementById('processingLabel');

    // Tabs
    const tabCamera = document.getElementById('tabCamera');
    const tabUpload = document.getElementById('tabUpload');
    const cameraPanel = document.getElementById('cameraPanel');
    const uploadPanel = document.getElementById('uploadPanel');

    // Upload
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadPreview = document.getElementById('uploadPreview');
    const previewImage = document.getElementById('previewImage');
    const removeImage = document.getElementById('removeImage');
    const uploadBtn = document.getElementById('uploadBtn');

    // Audio controls
    const audioPlayer = document.getElementById('audioPlayer');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const stopAudioBtn = document.getElementById('stopAudioBtn');
    const replayBtn = document.getElementById('replayBtn');
    const speedSelect = document.getElementById('speedSelect');

    // Actions
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');

    // ── State ──
    let stream = null;
    let uploadedFile = null;
    let currentExtractedText = '';
    let isProcessing = false;
    let isSpeaking = false;

    // Speech synthesis
    const synth = window.speechSynthesis;

    // Speed presets mapping to SpeechSynthesis rate values
    const SPEED_RATES = {
        slow: 0.7,
        normal: 1.0,
        fast: 1.5,
    };

    // API base URL — use same origin
    const API_BASE = window.location.origin;

    // ── Toast Notification ──
    function showToast(message, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // ── Tab Switching ──
    function switchTab(tab) {
        const isCamera = tab === 'camera';

        tabCamera.classList.toggle('active', isCamera);
        tabCamera.setAttribute('aria-selected', isCamera);
        tabUpload.classList.toggle('active', !isCamera);
        tabUpload.setAttribute('aria-selected', !isCamera);

        cameraPanel.classList.toggle('active', isCamera);
        cameraPanel.hidden = !isCamera;
        uploadPanel.classList.toggle('active', !isCamera);
        uploadPanel.hidden = isCamera;

        if (isCamera && !stream) {
            initCamera();
        }
    }

    tabCamera.addEventListener('click', () => switchTab('camera'));
    tabUpload.addEventListener('click', () => switchTab('upload'));

    // Keyboard support for tabs
    [tabCamera, tabUpload].forEach(tab => {
        tab.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const target = e.key === 'ArrowLeft' ? tabCamera : tabUpload;
                target.click();
                target.focus();
            }
        });
    });

    // ── Status Helpers ──
    function setStatus(message, showOverlay = true, showSpinner = false) {
        statusText.textContent = message;
        spinner.classList.toggle('hidden', !showSpinner);
        if (showOverlay) {
            statusOverlay.classList.remove('hidden');
        } else {
            statusOverlay.classList.add('hidden');
        }
    }

    function showProcessing(message) {
        processingLabel.textContent = message;
        processingBar.classList.remove('hidden');
        isProcessing = true;
    }

    function hideProcessing() {
        processingBar.classList.add('hidden');
        isProcessing = false;
    }

    // ── Camera ──
    async function initCamera() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setStatus('Camera not available on this device.', true, false);
                return;
            }

            setStatus('Initializing Camera...', true, true);

            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            };

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;

            video.onloadedmetadata = () => {
                setStatus('', false);
                captureBtn.disabled = false;
            };
        } catch (err) {
            console.error('Camera access error:', err);
            if (err.name === 'NotAllowedError') {
                setStatus('Camera permission denied.', true, false);
            } else if (err.name === 'NotFoundError') {
                setStatus('No camera found. Try uploading an image.', true, false);
            } else {
                setStatus('Camera error. Try the Upload tab.', true, false);
            }
        }
    }

    // ── Capture from Camera ──
    captureBtn.addEventListener('click', async () => {
        if (!stream || isProcessing) return;

        captureBtn.disabled = true;
        showProcessing('Capturing image...');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
            if (!blob) {
                hideProcessing();
                captureBtn.disabled = false;
                showToast('Failed to capture image.', 'error');
                return;
            }
            await processImage(blob, 'capture.jpg');
            captureBtn.disabled = false;
        }, 'image/jpeg', 0.85);
    });

    // ── Upload: Drag & Drop ──
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFileSelection(fileInput.files[0]);
        }
    });

    function handleFileSelection(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showToast('Please select a JPG, PNG, BMP, or WebP image.', 'error');
            return;
        }
        if (file.size > 1024 * 1024) {
            showToast('File too large. Maximum 1MB allowed for OCR.', 'error');
            return;
        }

        uploadedFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            uploadPreview.classList.remove('hidden');
            uploadZone.style.display = 'none';
            uploadBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    removeImage.addEventListener('click', () => {
        uploadedFile = null;
        uploadPreview.classList.add('hidden');
        uploadZone.style.display = '';
        uploadBtn.disabled = true;
        fileInput.value = '';
    });

    uploadBtn.addEventListener('click', async () => {
        if (!uploadedFile || isProcessing) return;
        uploadBtn.disabled = true;
        await processImage(uploadedFile, uploadedFile.name);
        uploadBtn.disabled = false;
    });

    // ── Core: Process Image → OCR ──
    async function processImage(fileOrBlob, filename) {
        showProcessing('Extracting text...');

        const formData = new FormData();
        formData.append('file', fileOrBlob, filename);

        try {
            const response = await fetch(`${API_BASE}/api/ocr`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Server error (${response.status})`);
            }

            const data = await response.json();

            if (data.success && data.text && data.text.trim().length > 0) {
                currentExtractedText = data.text;

                // Show extracted text
                resultContainer.classList.remove('hidden');
                resultText.textContent = data.text;

                // Show audio controls and auto-play speech
                audioPlayer.classList.remove('hidden');
                hideProcessing();
                showToast('Text extracted successfully!');

                // Start speaking
                speakText(data.text);
            } else {
                hideProcessing();
                const errorMsg = data.error || 'No text found in image.';
                showToast(errorMsg, 'error');
            }
        } catch (err) {
            console.error('Processing error:', err);
            hideProcessing();
            showToast('Processing failed. Please try again.', 'error');
        }
    }

    // ── TTS: Browser SpeechSynthesis ──
    function speakText(text) {
        // Cancel any ongoing speech
        if (synth.speaking || synth.pending) {
            synth.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en';
        utterance.rate = SPEED_RATES[speedSelect.value] || 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            isSpeaking = true;
            setPlayState(true);
        };

        utterance.onend = () => {
            isSpeaking = false;
            setPlayState(false);
        };

        utterance.onerror = (e) => {
            // 'interrupted' and 'canceled' are expected when user stops/replays
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                console.error('Speech error:', e.error);
                showToast('Speech playback error.', 'error');
            }
            isSpeaking = false;
            setPlayState(false);
        };

        synth.speak(utterance);
    }

    function stopSpeech() {
        if (synth.speaking || synth.pending) {
            synth.cancel();
        }
        isSpeaking = false;
        setPlayState(false);
    }

    // ── Audio Controls ──
    function setPlayState(playing) {
        playIcon.style.display = playing ? 'none' : '';
        pauseIcon.style.display = playing ? '' : 'none';
        playPauseBtn.setAttribute('aria-label', playing ? 'Pause speech' : 'Play speech');
    }

    playPauseBtn.addEventListener('click', () => {
        if (!currentExtractedText) return;

        if (synth.speaking && !synth.paused) {
            // Currently speaking → pause
            synth.pause();
            isSpeaking = false;
            setPlayState(false);
        } else if (synth.paused) {
            // Currently paused → resume
            synth.resume();
            isSpeaking = true;
            setPlayState(true);
        } else {
            // Not speaking → start fresh
            speakText(currentExtractedText);
        }
    });

    stopAudioBtn.addEventListener('click', () => {
        stopSpeech();
    });

    replayBtn.addEventListener('click', () => {
        if (!currentExtractedText) return;
        stopSpeech();
        // Small delay to ensure cancel completes before new speech
        setTimeout(() => {
            speakText(currentExtractedText);
        }, 100);
    });

    // Speed change — restart speech at new speed
    speedSelect.addEventListener('change', () => {
        if (currentExtractedText && (synth.speaking || synth.paused)) {
            stopSpeech();
            setTimeout(() => {
                speakText(currentExtractedText);
            }, 100);
        }
    });

    // ── Download & Copy ──
    downloadBtn.addEventListener('click', async () => {
        if (!currentExtractedText) return;

        try {
            const formData = new FormData();
            formData.append('text', currentExtractedText);

            const response = await fetch(`${API_BASE}/api/text/download`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'extracted_text.txt';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            showToast('Text file downloaded.');
        } catch (err) {
            showToast('Download failed.', 'error');
        }
    });

    copyBtn.addEventListener('click', async () => {
        if (!currentExtractedText) return;
        try {
            await navigator.clipboard.writeText(currentExtractedText);
            showToast('Text copied to clipboard.');
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = currentExtractedText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            showToast('Text copied to clipboard.');
        }
    });

    // ── Keyboard Shortcuts ──
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) {
            e.preventDefault();
            if (currentExtractedText) {
                playPauseBtn.click();
            }
        }
    });

    // ── Workaround: Chrome pauses SpeechSynthesis after ~15 seconds ──
    // This keeps it alive by resuming periodically
    let resumeTimer = null;
    function startResumeWorkaround() {
        clearInterval(resumeTimer);
        resumeTimer = setInterval(() => {
            if (synth.speaking && !synth.paused) {
                synth.pause();
                synth.resume();
            }
        }, 10000);
    }

    // Start the workaround globally
    startResumeWorkaround();

    // ── Init ──
    initCamera();
});
