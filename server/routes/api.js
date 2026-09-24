/**
 * MP4Tube.video - API Routes
 * Handles all /api/* requests.
 *
 * Backend strategy:
 *   - Metadata (POST /api/info)            -> yt-dlp --dump-single-json
 *   - Downloads (POST /api/download)       -> yt-dlp stdout streamed to client
 *
 * yt-dlp is the de-facto standard tool for downloading YouTube content and
 * is far more reliable than the unmaintained ytdl-core npm package.
 */

const express = require('express');
const router = express.Router();
const youtubeService = require('../services/youtube');

// ---------------------------------------------------------------------------
// POST /api/info
// Get video metadata for the URL the user pasted.
// ---------------------------------------------------------------------------
router.post('/info', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a video URL',
            });
        }

        if (!youtubeService.isValidYouTubeUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid YouTube video link',
            });
        }

        const videoInfo = await youtubeService.getVideoInfo(url);

        res.json({
            success: true,
            data: videoInfo,
        });
    } catch (error) {
        console.error('API /info error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch video info',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/download
// Stream a download directly from yt-dlp's stdout to the HTTP response.
// ---------------------------------------------------------------------------
router.post('/download', async (req, res) => {
    const { url, quality, audio_only, format } = req.body;

    // ---- Validate request ----
    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'Video URL is required',
        });
    }
    if (!youtubeService.isValidYouTubeUrl(url)) {
        return res.status(400).json({
            success: false,
            error: 'Please provide a valid YouTube URL',
        });
    }

    const isAudioOnly = audio_only === true;
    const requestedFormat = (format || (isAudioOnly ? 'mp3' : 'mp4')).toLowerCase();
    const requestedQuality = parseInt(quality || (isAudioOnly ? '192' : '1080'), 10);

    console.log('Processing download:', {
        url,
        quality: requestedQuality,
        format: requestedFormat,
        audio_only: isAudioOnly,
    });

    let download;
    try {
        // Fetch metadata first so we can build a nice filename
        const info = await youtubeService.getVideoInfo(url);

        download = await youtubeService.downloadVideo(url, {
            audioOnly: isAudioOnly,
            format: requestedFormat,
            quality: requestedQuality,
            title: info.title,
        });
    } catch (error) {
        console.error('API /download error:', error.message);

        // Classify the error for a helpful user message
        let userMessage = error.message || 'Download failed.';
        const lower = userMessage.toLowerCase();

        if (lower.includes('yt-dlp binary not found')) {
            userMessage = 'yt-dlp is not installed on the server. Ask the server admin to run: winget install yt-dlp.yt-dlp';
        } else if (lower.includes('timeout')) {
            userMessage = 'Download timed out. YouTube may be rate-limiting your IP. Wait 5–10 minutes and try again, or try a shorter video.';
        } else if (lower.includes('ffmpeg') && lower.includes('not found')) {
            userMessage = 'ffmpeg is not installed. Audio extraction and high-quality video merging require ffmpeg. Install with: winget install Gyan.FFmpeg';
        } else if (lower.includes('error parsing') || lower.includes('invalid') || lower.includes('unavailable')) {
            userMessage = 'YouTube says this video is unavailable (private, age-restricted, or region-locked).';
        } else if (lower.includes('sign in to confirm')) {
            userMessage = 'YouTube requires sign-in for this video (likely age-restricted). Try a different video.';
        }

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: userMessage,
            });
        }
        return;
    }

    const { stream, filename, contentType, contentLength, cleanup } = download;

    // ---- Send headers BEFORE piping the stream ----
    res.setHeader('Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
        res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    // ---- Wire stream lifecycle ----
    let aborted = false;

    // If the client disconnects mid-download, just stop sending bytes; the
    // service layer already handles cleanup of the temp file.
    req.on('close', () => {
        if (!res.writableEnded) {
            aborted = true;
            stream.destroy();
        }
    });

    stream.on('error', (err) => {
        console.error('[download] stream error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Download stream error: ' + err.message,
            });
        } else if (!res.writableEnded) {
            res.end();
        }
    });

    res.on('close', () => {
        if (cleanup) cleanup();
    });

    // Pipe the file to the HTTP response
    stream.pipe(res);
});

// ---------------------------------------------------------------------------
// GET /api/formats
// Static list of formats the UI offers.
// ---------------------------------------------------------------------------
router.get('/formats', (req, res) => {
    res.json({
        success: true,
        data: {
            video: ['mp4', 'webm', 'mkv'],
            audio: ['mp3', 'm4a', 'wav'],
            videoQualities: ['2160', '1440', '1080', '720', '480', '360'],
            audioQualities: ['320', '256', '192', '128'],
        },
    });
});

// ---------------------------------------------------------------------------
// GET /api/health
// Health check — also verifies yt-dlp is reachable.
// ---------------------------------------------------------------------------
router.get('/health', async (req, res) => {
    try {
        const ytDlp = await youtubeService.getYtDlpPath();
        res.json({
            success: true,
            status: 'ok',
            ytDlpPath: ytDlp,
            ytDlpAvailable: !!ytDlp,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 'error',
            error: err.message,
        });
    }
});

module.exports = router;
