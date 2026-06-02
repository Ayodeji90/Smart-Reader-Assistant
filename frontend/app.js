/**
 * Smart Reader Assistant — Frontend Application
 *
 * Handles:
 * - Camera capture (rear camera on mobile)
 * - Image file upload (drag-and-drop + file picker)
 * - OCR text extraction via backend API
 * - Server-side TTS audio playback with full controls
 * - Text download and copy
 * - Accessibility: keyboard navigation, ARIA live regions, audio cues
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

    // Audio player
    const audioPlayer = document.getElementById('audioPlayer');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const stopAudioBtn = document.getElementById('stopAudioBtn');
    const replayBtn = document.getElementById('replayBtn');
    const audioProgressContainer = document.getElementById('audioProgressContainer');
    const audioProgressBar = document.getElementById('audioProgressBar');
    const audioCurrentTime = document.getElementById('audioCurrentTime');
    const audioDuration = document.getElementById('audioDuration');
    const speedSelect = document.getElementById('speedSelect');

    // Actions
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');

    // ── State ──
    let stream = null;
    let uploadedFile = null;
    let audioElement = null;
    let currentExtractedText = '';
    let isProcessing = false;

    // API base URL — use same origin so it works everywhere
    const API_BASE = window.location.origin;

    // ── Toast Notification ──
    function showToast(message, type = 'success') {
        // Remove existing toast
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
        }, 'image/jpeg', 0.92);
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
        // Validate on client side
        const validTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showToast('Please select a JPG, PNG, BMP, or WebP image.', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast('File too large. Maximum 10 MB allowed.', 'error');
            return;
        }

        uploadedFile = file;

        // Show preview
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

    // ── Core: Process Image → OCR → TTS ──
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

                // Generate & play audio
                showProcessing('Generating speech...');
                await generateAndPlayAudio(data.text);

                hideProcessing();
                showToast('Text extracted successfully!');
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

    // ── TTS: Generate Audio from Server ──
    async function generateAndPlayAudio(text, speed) {
        speed = speed || speedSelect.value;

        // Stop any current playback
        stopAudio();

        const formData = new FormData();
        formData.append('text', text);
        formData.append('speed', speed);

        try {
            const response = await fetch(`${API_BASE}/api/tts`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`TTS failed (${response.status})`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            // Create audio element
            audioElement = new Audio(audioUrl);
            audioElement.preload = 'auto';

            // Set up event listeners
            audioElement.addEventListener('loadedmetadata', () => {
                audioDuration.textContent = formatTime(audioElement.duration);
            });

            audioElement.addEventListener('timeupdate', () => {
                if (audioElement.duration) {
                    const progress = (audioElement.currentTime / audioElement.duration) * 100;
                    audioProgressBar.style.width = progress + '%';
                    audioCurrentTime.textContent = formatTime(audioElement.currentTime);
                    audioProgressContainer.setAttribute('aria-valuenow', Math.round(progress));
                }
            });

            audioElement.addEventListener('ended', () => {
                setPlayState(false);
                audioProgressBar.style.width = '100%';
            });

            audioElement.addEventListener('error', () => {
                showToast('Audio playback error.', 'error');
                setPlayState(false);
            });

            // Show player and start playback
            audioPlayer.classList.remove('hidden');
            await audioElement.play();
            setPlayState(true);

        } catch (err) {
            console.error('TTS error:', err);
            showToast('Speech generation failed.', 'error');
        }
    }

    // ── Audio Controls ──
    function setPlayState(playing) {
        playIcon.style.display = playing ? 'none' : '';
        pauseIcon.style.display = playing ? '' : 'none';
        playPauseBtn.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    }

    playPauseBtn.addEventListener('click', () => {
        if (!audioElement) return;
        if (audioElement.paused) {
            audioElement.play();
            setPlayState(true);
        } else {
            audioElement.pause();
            setPlayState(false);
        }
    });

    function stopAudio() {
        if (audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
            setPlayState(false);
            audioProgressBar.style.width = '0%';
            audioCurrentTime.textContent = '0:00';
        }
    }

    stopAudioBtn.addEventListener('click', stopAudio);

    replayBtn.addEventListener('click', () => {
        if (audioElement) {
            audioElement.currentTime = 0;
            audioElement.play();
            setPlayState(true);
        }
    });

    // Progress bar click-to-seek
    audioProgressContainer.addEventListener('click', (e) => {
        if (!audioElement || !audioElement.duration) return;
        const rect = audioProgressContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        audioElement.currentTime = percent * audioElement.duration;
    });

    // Keyboard seek on progress bar
    audioProgressContainer.addEventListener('keydown', (e) => {
        if (!audioElement || !audioElement.duration) return;
        if (e.key === 'ArrowRight') {
            audioElement.currentTime = Math.min(audioElement.currentTime + 5, audioElement.duration);
        } else if (e.key === 'ArrowLeft') {
            audioElement.currentTime = Math.max(audioElement.currentTime - 5, 0);
        }
    });

    // Speed change — regenerate audio at new speed
    speedSelect.addEventListener('change', () => {
        if (currentExtractedText) {
            generateAndPlayAudio(currentExtractedText, speedSelect.value);
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

    // ── Utilities ──
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // ── Keyboard Shortcuts ──
    document.addEventListener('keydown', (e) => {
        // Space to play/pause audio (when not focused on input)
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) {
            e.preventDefault();
            if (audioElement) {
                playPauseBtn.click();
            }
        }
    });

    // ── Init ──
    initCamera();
});
