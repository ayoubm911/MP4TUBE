/**
 * MP4Tube.video - Frontend Application Logic
 * Handles user interactions and API communication.
 *
 * DOM contract: see /public/index.html. The classes used here
 * (.qf-opt, .url-pill-btn, etc.) match that file. Hidden <select>
 * elements keep working as the source of truth for the form state,
 * so the existing backend calls don't need any changes.
 */

// =====================
// DOM elements
// =====================
const videoUrlInput   = document.getElementById('videoUrl');
const fetchBtn        = document.getElementById('fetchBtn');
const downloaderPanel = document.getElementById('downloaderPanel');
const videoInfoSection = document.getElementById('videoInfo');
const videoThumbnail  = document.getElementById('videoThumbnail');
const videoTitle      = document.getElementById('videoTitle');
const videoDuration   = document.getElementById('videoDuration');
const videoUploader   = document.getElementById('videoUploader');

// Hidden <select> elements (mirror the visible toggle/option buttons).
const downloadType    = document.getElementById('downloadType');
const videoQuality    = document.getElementById('videoQuality');
const audioQuality    = document.getElementById('audioQuality');
const videoFormat     = document.getElementById('videoFormat');
const audioFormat     = document.getElementById('audioFormat');

// Visible type-toggle buttons + option cards.
const typeVideoBtn    = document.getElementById('typeVideoBtn');
const typeAudioBtn    = document.getElementById('typeAudioBtn');
const videoQualityCard = document.getElementById('videoQualityCard');
const videoFormatCard  = document.getElementById('videoFormatCard');
const audioQualityCard = document.getElementById('audioQualityCard');
const audioFormatCard  = document.getElementById('audioFormatCard');
const summaryText     = document.getElementById('summaryText');

// Download CTA + progress.
const downloadBtn       = document.getElementById('downloadBtn');
const downloadBtnText   = document.getElementById('downloadBtnText');
const downloadBtnLoader = document.getElementById('downloadBtnLoader');
const ctaLabel          = document.getElementById('ctaLabel');
const errorMessage      = document.getElementById('urlError');
const errorSection      = document.getElementById('errorSection');
const errorText         = document.getElementById('errorText');
const downloadProgress  = document.getElementById('downloadProgress');
const progressFill      = document.getElementById('progressFill');
const progressText      = document.getElementById('progressText');

// Mobile header chrome.
const navToggle         = document.getElementById('navToggle');
const mobileMenu        = document.getElementById('mobileMenu');

// =====================
// State
// =====================
let currentVideoInfo    = null;
let fetchDebounceTimer  = null;

// =====================
// Utility
// =====================

/**
 * Tiny ephemeral toast in the top-right corner.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/** Format seconds as h:mm:ss or m:ss. */
function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    const hours   = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs    = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** Loose YouTube URL validator - covers watch, youtu.be, embed, shorts, /v/. */
function isValidYouTubeUrl(url) {
    const patterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
        /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
        /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
        /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/,
    ];
    return patterns.some((p) => p.test(url));
}

function showError(message) {
    if (!errorSection || !errorText) return;
    errorSection.style.display = 'block';
    errorText.textContent = message;
}
function hideError() {
    if (errorSection) errorSection.style.display = 'none';
    if (errorMessage)  errorMessage.textContent = '';
}

// =====================
// UI: Audio / Video Toggle & Option Cards
// =====================

/**
 * Switches the visible state between audio and video modes, and toggles
 * the visibility of the matching quality + format cards.
 */
function setDownloadType(type) {
    if (!downloadType) return;
    downloadType.value = type;

    if (typeVideoBtn) typeVideoBtn.classList.toggle('active', type === 'video');
    if (typeAudioBtn) typeAudioBtn.classList.toggle('active', type === 'audio');
    if (typeVideoBtn) typeVideoBtn.setAttribute('aria-selected', String(type === 'video'));
    if (typeAudioBtn) typeAudioBtn.setAttribute('aria-selected', String(type === 'audio'));

    const showVideo = type === 'video';
    if (videoQualityCard) videoQualityCard.style.display = showVideo ? '' : 'none';
    if (videoFormatCard)  videoFormatCard.style.display  = showVideo ? '' : 'none';
    if (audioQualityCard) audioQualityCard.style.display = showVideo ? 'none' : '';
    if (audioFormatCard)  audioFormatCard.style.display  = showVideo ? 'none' : '';

    updateSummary();
}

/**
 * Bind click handlers for every .qf-opt inside a container. The hidden
 * <select> stays the source of truth - we just sync its value + active class.
 */
function wireOptionGroup(containerId, hiddenSelect) {
    const container = document.getElementById(containerId);
    if (!container || !hiddenSelect) return;

    container.querySelectorAll('.qf-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.qf-opt').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            hiddenSelect.value = btn.dataset.value;
            updateSummary();
        });
    });
}

/** Build the "🎬 Video · 1080p · MP4" summary line in the downloader card. */
function updateSummary() {
    if (!summaryText || !downloadType) return;
    const isAudio = downloadType.value === 'audio';

    if (isAudio) {
        const q = audioQuality.value;
        const f = (audioFormat.value || 'mp3').toUpperCase();
        const label =
            q === '320' ? 'Best' :
            q === '256' ? 'High' :
            q === '192' ? 'Medium' : 'Standard';
        summaryText.textContent = `Audio · ${label} · ${q} kbps · ${f}`;
    } else {
        const q = videoQuality.value;
        const f = (videoFormat.value || 'mp4').toUpperCase();
        summaryText.textContent = `Video · ${q}p · ${f}`;
    }

    // The CTA's primary label is derived from the live form state.
    // Examples:
    //   "↓ Download 1080p · MP4"
    //   "↓ Download MP3 · 192kbps"
    if (ctaLabel) {
        if (isAudio) {
            const f = (audioFormat.value || 'mp3').toUpperCase();
            ctaLabel.textContent = `Download ${f} · ${audioQuality.value}kbps`;
        } else {
            const f = (videoFormat.value || 'mp4').toUpperCase();
            ctaLabel.textContent = `Download ${videoQuality.value}p · ${f}`;
        }
    }
}

// =====================
// API
// =====================

/**
 * Fetch metadata for the URL the user pasted.
 * @param {boolean} silent - if true, don't surface "please wait" UI / toasts
 */
async function fetchVideoInfo(silent = false) {
    const url = (videoUrlInput?.value || '').trim();
    if (!url) {
        currentVideoInfo = null;
        hideDownloaderPanel();
        return;
    }
    if (!isValidYouTubeUrl(url)) {
        currentVideoInfo = null;
        hideDownloaderPanel();
        if (!silent && errorMessage) {
            errorMessage.textContent = 'Please enter a valid YouTube video URL';
        }
        return;
    }

    hideError();

    if (!silent && fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.classList.add('loading');
    }

    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        // Read the response as text first - if the backend is missing we
        // may get HTML (e.g. Vercel login wall or a generic 404 page) which
        // would crash `response.json()`.
        const rawText = await response.text();
        let data;
        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch (parseErr) {
            console.error('Non-JSON response from /api/info:', rawText.slice(0, 200));
            throw new Error(
                response.ok
                    ? 'The download backend did not return a valid response. Make sure the backend server is running.'
                    : 'The download backend is not reachable. Run locally with: npm start'
            );
        }

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to fetch video info');
        }

        currentVideoInfo = data.data;
        displayVideoInfo(currentVideoInfo);
        showDownloaderPanel();
        if (!silent) showToast('Video info loaded', 'success');
    } catch (error) {
        console.error('Fetch error:', error);
        hideDownloaderPanel();
        if (!silent) {
            // Detect a missing backend (static-only deployment) and show a clear message
            const isStaticOnly =
                error instanceof TypeError && /Failed to fetch/i.test(error.message) ||
                (typeof error.message === 'string' && /404|backend|reachable/i.test(error.message));
            const friendly = isStaticOnly
                ? 'The download backend is not reachable. Run locally with: npm start'
                : (error.message || 'Failed to fetch video information. Please check the URL and try again.');
            showError(friendly);
            showToast('Error: ' + friendly, 'error');
        }
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.classList.remove('loading');
        }
    }
}

/** Reveal the format-options panel below the URL bar. */
function showDownloaderPanel() {
    if (!downloaderPanel) return;
    downloaderPanel.classList.remove('downloader-panel-hidden');
    downloaderPanel.setAttribute('aria-hidden', 'false');
}

/** Hide the format-options panel (called when URL is empty/invalid/failed). */
function hideDownloaderPanel() {
    if (!downloaderPanel) return;
    downloaderPanel.classList.add('downloader-panel-hidden');
    downloaderPanel.setAttribute('aria-hidden', 'true');
    if (videoInfoSection) videoInfoSection.style.display = 'none';
}

/** Debounced auto-fetch when the user pastes / types a URL. */
function debouncedFetch() {
    clearTimeout(fetchDebounceTimer);
    fetchDebounceTimer = setTimeout(() => {
        const url = (videoUrlInput?.value || '').trim();
        // Only auto-fetch when the URL looks valid. Otherwise just hide the panel.
        if (url && isValidYouTubeUrl(url)) {
            fetchVideoInfo(true);
        } else {
            currentVideoInfo = null;
            hideDownloaderPanel();
        }
    }, 800);
}

/** Fill the video-info card from the metadata payload. */
function displayVideoInfo(info) {
    if (!info || !videoInfoSection) return;

    if (videoThumbnail) {
        videoThumbnail.src = info.thumbnail || '';
        videoThumbnail.alt = info.title || '';
    }
    if (videoTitle)    videoTitle.textContent = info.title || 'Untitled';
    if (videoDuration) videoDuration.textContent = formatDuration(info.duration);
    if (videoUploader) videoUploader.textContent = info.uploader || 'Unknown channel';

    videoInfoSection.style.display = 'flex';
    updateSummary();
}

/**
 * Main CTA: kick off the actual download. The UI mirrors `/api/download`'s
 * contract - the user picks audio_only, format, quality - and we stream the
 * returned blob to the browser as a file save.
 */
async function downloadMedia() {
    const url = (videoUrlInput?.value || '').trim();

    if (!url) {
        showToast('Please enter a YouTube URL first', 'error');
        videoUrlInput?.focus();
        return;
    }
    if (!isValidYouTubeUrl(url)) {
        showToast('Please enter a valid YouTube URL', 'error');
        return;
    }

    // If we don't already know what this video is, fetch it first so we
    // can show a proper progress state instead of "preparing..." forever.
    if (!currentVideoInfo) {
        showToast('Loading video info first...', 'info');
        await fetchVideoInfo(true);
    }
    if (!currentVideoInfo) {
        showToast('Could not load video information. Check the URL.', 'error');
        return;
    }

    const isAudio = downloadType.value === 'audio';
    const quality = isAudio ? audioQuality.value : videoQuality.value;
    const format  = isAudio ? audioFormat.value  : videoFormat.value;

    // UI: switch the CTA to "Downloading…" state.
    if (downloadProgress) downloadProgress.style.display = 'block';
    if (downloadBtn) downloadBtn.disabled = true;
    if (downloadBtnText)   downloadBtnText.style.display   = 'none';
    if (downloadBtnLoader) downloadBtnLoader.style.display = 'inline-flex';
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = 'Preparing download...';

    // Decorative progress (server doesn't stream progress events yet).
    let progress = 0;
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 10;
            if (progressFill) progressFill.style.width = Math.min(progress, 90) + '%';
            if (progressText) progressText.textContent = `Downloading… ${Math.floor(progress)}%`;
        }
    }, 500);

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, quality, format, audio_only: isAudio }),
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            // Try to parse the error as JSON; otherwise surface the raw text so
            // we never crash with "Unexpected token...".
            const rawText = await response.text().catch(() => '');
            let errMsg = 'Download failed';
            try {
                if (rawText) {
                    const errorData = JSON.parse(rawText);
                    errMsg = errorData.error || errMsg;
                }
            } catch (_) {
                if (rawText) errMsg = rawText.slice(0, 200);
            }
            throw new Error(errMsg);
        }

        // Derive filename from the server's Content-Disposition, falling
        // back to "<video title>.<ext>" so users get a usable name even
        // when the header is absent (e.g. when behind some proxies).
        let filename = 'download';
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const matches = /filename="?([^";]+)"?/.exec(contentDisposition);
            if (matches && matches[1]) {
                try { filename = decodeURIComponent(matches[1]); }
                catch (_) { filename = matches[1]; }
            }
        } else {
            const ext = isAudio ? audioFormat.value : videoFormat.value;
            const safeTitle = (currentVideoInfo.title || 'video').replace(/[^\w\s-]/g, '');
            filename = `${safeTitle}.${ext}`;
        }

        const blob     = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const a        = document.createElement('a');
        a.href     = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(objectUrl);

        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Download complete!';
        showToast('Download started', 'success');

        setTimeout(() => {
            if (downloadProgress) downloadProgress.style.display = 'none';
            if (progressFill)     progressFill.style.width = '0%';
        }, 3000);
    } catch (error) {
        console.error('Download error:', error);
        clearInterval(progressInterval);
        if (progressText) progressText.textContent = 'Download failed';
        showToast('Download failed: ' + error.message, 'error');

        setTimeout(() => {
            if (downloadProgress) downloadProgress.style.display = 'none';
        }, 3000);
    } finally {
        if (downloadBtn) downloadBtn.disabled = false;
        if (downloadBtnText)   downloadBtnText.style.display   = 'inline-flex';
        if (downloadBtnLoader) downloadBtnLoader.style.display = 'none';
    }
}

// =====================
// Event wiring
// =====================

if (fetchBtn) {
    fetchBtn.addEventListener('click', () => fetchVideoInfo(false));
}

if (videoUrlInput) {
    // Enter triggers an explicit fetch (no debounce).
    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            fetchVideoInfo(false);
        }
    });
    // Typing / paste triggers a debounced silent fetch, so the panel
    // appears once a valid URL is detected. Clearing the URL hides the panel.
    videoUrlInput.addEventListener('input', () => {
        if (errorMessage) errorMessage.textContent = '';
        const url = (videoUrlInput.value || '').trim();
        if (!url) {
            currentVideoInfo = null;
            hideDownloaderPanel();
            return;
        }
        debouncedFetch();
    });
}

if (typeVideoBtn) typeVideoBtn.addEventListener('click', () => setDownloadType('video'));
if (typeAudioBtn) typeAudioBtn.addEventListener('click', () => setDownloadType('audio'));

// Option buttons (one group per visible card).
wireOptionGroup('videoQualityOptions', videoQuality);
wireOptionGroup('videoFormatOptions',  videoFormat);
wireOptionGroup('audioQualityOptions', audioQuality);
wireOptionGroup('audioFormatOptions',  audioFormat);

// Keep summary in sync if the hidden <select> changes for any reason
// (browser autofill, devtools, etc.).
if (downloadType)  downloadType.addEventListener('change', () => setDownloadType(downloadType.value));
if (videoQuality)  videoQuality.addEventListener('change', updateSummary);
if (videoFormat)   videoFormat.addEventListener('change',  updateSummary);
if (audioQuality)  audioQuality.addEventListener('change', updateSummary);
if (audioFormat)   audioFormat.addEventListener('change',  updateSummary);

if (downloadBtn) downloadBtn.addEventListener('click', downloadMedia);

// Initial state.
setDownloadType('video');
updateSummary();

// Mobile menu toggle (UI-only - doesn't change any backend behavior)
if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', () => {
        const open = navToggle.getAttribute('aria-expanded') === 'true';
        navToggle.setAttribute('aria-expanded', String(!open));
        mobileMenu.hidden = open;
        mobileMenu.setAttribute('data-open', String(!open));
    });
    // Close menu when a link is tapped
    mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        mobileMenu.hidden = true;
        mobileMenu.setAttribute('data-open', 'false');
    }));
}

// Smooth-scroll for in-page nav anchors (Features / How to Use / FAQ).
document.querySelectorAll('.header-nav a, .mobile-menu a').forEach((link) => {
    link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
});

console.log('MP4Tube.video initialized successfully!');
