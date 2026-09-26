/**
 * MP4Tube.video - YouTube Download Service
 * Uses the yt-dlp binary for metadata extraction and file downloads.
 * yt-dlp is the most actively maintained tool for this, far more reliable
 * than the abandoned ytdl-core npm package.
 */

const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Binary discovery
// ---------------------------------------------------------------------------
const WINGET_YT_DLP_DIRS = [
    path.join(os.homedir(),
        'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages',
        'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe'),
];

const WINGET_FFMPEG_DIRS = [
    path.join(os.homedir(),
        'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages',
        'yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
        'ffmpeg-N-125875-g5d4d3bdc61-win64-gpl', 'bin'),
];

function findExecutable(name, wingetDirs) {
    return new Promise((resolve) => {
        const finder = process.platform === 'win32' ? 'where' : 'which';
        execFile(finder, [name], (err, stdout) => {
            if (!err && stdout) {
                const first = stdout.toString().split(/\r?\n/)[0].trim();
                if (first) return resolve(first);
            }
            for (const dir of wingetDirs) {
                const exe = process.platform === 'win32' ? `${name}.exe` : name;
                const full = path.join(dir, exe);
                if (fs.existsSync(full)) return resolve(full);
            }
            resolve(null);
        });
    });
}

let cachedYtDlpPath = null;
let cachedFfmpegDir = null;

async function getYtDlpPath() {
    if (cachedYtDlpPath) return cachedYtDlpPath;
    cachedYtDlpPath = await findExecutable('yt-dlp', WINGET_YT_DLP_DIRS);
    return cachedYtDlpPath;
}

async function getFfmpegDir() {
    if (cachedFfmpegDir !== null) return cachedFfmpegDir;
    const ffmpegPath = await findExecutable('ffmpeg', WINGET_FFMPEG_DIRS);
    if (ffmpegPath) {
        cachedFfmpegDir = path.dirname(ffmpegPath);
    } else {
        cachedFfmpegDir = '';
    }
    return cachedFfmpegDir;
}

// ---------------------------------------------------------------------------
// Temporary storage
// ---------------------------------------------------------------------------
const TEMP_DIR = path.join(os.tmpdir(), 'mp4tube-downloads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------
function isValidYouTubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const patterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
        /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
        /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/,
        /^https?:\/\/m\.youtube\.com\/watch\?v=[\w-]+/,
        /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
    ];
    return patterns.some((p) => p.test(url.trim()));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Run yt-dlp and wait for it to fully complete.
 * Used for metadata only (small JSON output).
 */
function runYtDlp(args, { timeoutMs = 90000 } = {}) {
    return new Promise(async (resolve, reject) => {
        const ytDlp = await getYtDlpPath();
        if (!ytDlp) {
            return reject(new Error(
                'yt-dlp binary not found. Install with: winget install yt-dlp.yt-dlp'));
        }
        const env = { ...process.env };
        const ffmpegDir = await getFfmpegDir();
        if (ffmpegDir) {
            env.PATH = ffmpegDir + path.delimiter + (env.PATH || '');
        }
        let settled = false;
        const child = execFile(ytDlp, args, {
            env,
            timeout: timeoutMs,
            maxBuffer: 32 * 1024 * 1024,
        }, (err, stdout, stderr) => {
            settled = true;
            if (err) {
                err.stderr = stderr;
                err.stdout = stdout;
                return reject(err);
            }
            resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
        child.on('exit', () => { if (!settled) settled = true; });
    });
}

/**
 * Poll until a file exists and its byte size has been stable for
 * `stableForMs` milliseconds. This tells us yt-dlp has finished writing.
 * Throws if `timeoutMs` elapses before stability is reached.
 */
function waitForFile(filePath, { timeoutMs = 120_000, stableForMs = 2000, onCheck } = {}) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        let prevSize = -1;
        let stableMs = 0;
        const INTERVAL = 300;

        const check = () => {
            if (fs.existsSync(filePath)) {
                try {
                    const s = fs.statSync(filePath).size;
                    onCheck && onCheck(s);
                    if (s > 0 && s === prevSize) {
                        stableMs += INTERVAL;
                        if (stableMs >= stableForMs) {
                            return resolve(filePath);
                        }
                    } else {
                        stableMs = 0;
                    }
                    prevSize = s;
                } catch (_) {}
            }

            if (Date.now() - start > timeoutMs) {
                return reject(new Error(
                    `Timeout after ${Math.round(timeoutMs / 1000)}s waiting for download. ` +
                    `YouTube may be rate-limiting this request — try again in a few minutes.`));
            }

            setTimeout(check, INTERVAL);
        };

        check();
    });
}

function sanitizeFilename(s) {
    return (s || '').replace(/[^\w\s\-.]/g, '').trim();
}

function getContentType(ext) {
    const types = {
        mp3: 'audio/mpeg',
        mp4: 'video/mp4',
        m4a: 'audio/mp4',
        wav: 'audio/wav',
        webm: 'video/webm',
        mkv: 'video/x-matroska',
        '3gp': 'video/3gpp',
        flv: 'video/x-flv',
        ogg: 'audio/ogg',
        opus: 'audio/ogg',
    };
    return types[(ext || '').toLowerCase()] || 'application/octet-stream';
}

function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('[cleanup] removed:', filePath);
        }
    } catch (err) {
        console.error('[cleanup] failed:', err.message);
    }
}

// Player-client fallbacks. YouTube fingerprints datacenter IPs (Render,
// AWS, Vercel, etc.) and blocks the default `web` client aggressively.
// Trying web → android → ios → tv_embedded in order gives the best chance
// of getting a player response back from a cloud server.
// On a residential IP any single client works, so the order is harmless there.
const PLAYER_CLIENT_FALLBACKS = 'web,android,ios,tv_embedded';

// ---------------------------------------------------------------------------
// Public API: getVideoInfo
// ---------------------------------------------------------------------------
async function getVideoInfo(videoUrl) {
    console.log('[yt-dlp] Fetching metadata:', videoUrl);
    const { stdout } = await runYtDlp(
        [
            '--no-warnings',
            '--no-playlist',
            '--no-check-certificates',
            '--extractor-args', `youtube:player_client=${PLAYER_CLIENT_FALLBACKS}`,
            '--dump-single-json',
            videoUrl,
        ],
        { timeoutMs: 90_000 }
    );

    const info = JSON.parse(stdout);
    return {
        title:     info.title     || 'Unknown Title',
        thumbnail: pickBestThumbnail(info.thumbnails),
        duration:  parseInt(info.duration)   || 0,
        description: info.description || '',
        uploader:  info.uploader  || info.channel || 'Unknown',
        viewCount: parseInt(info.view_count) || 0,
        uploadDate: info.upload_date || '',
    };
}

function pickBestThumbnail(thumbs) {
    if (!Array.isArray(thumbs) || thumbs.length === 0) return '';
    const sorted = [...thumbs].sort((a, b) => {
        const ap = (a.preference ?? 0) + (a.width || 0) / 10000;
        const bp = (b.preference ?? 0) + (b.width || 0) / 10000;
        return bp - ap;
    });
    return sorted[0].url || '';
}

// ---------------------------------------------------------------------------
// Public API: getAvailableFormats
// ---------------------------------------------------------------------------
async function getAvailableFormats(videoUrl) {
    const { stdout } = await runYtDlp(
        [
            '--no-warnings',
            '--no-playlist',
            '--no-check-certificates',
            '--extractor-args', `youtube:player_client=${PLAYER_CLIENT_FALLBACKS}`,
            '--dump-single-json',
            videoUrl,
        ],
        { timeoutMs: 90_000 }
    );
    const info = JSON.parse(stdout);
    return info.formats || [];
}

// ---------------------------------------------------------------------------
// Public API: downloadVideo
//
// Flow:
//   1. Spawn yt-dlp to write a UNIQUE temp file (UUID-named)
//   2. waitForFile() polls until the file exists and is stable (yt-dlp done)
//   3. Detect real extension (yt-dlp may change mp4→webm etc.)
//   4. Stream the completed file to the HTTP response
//   5. Clean up the temp file after the stream finishes
// ---------------------------------------------------------------------------
async function downloadVideo(videoUrl, options) {
    const { audioOnly, format, quality, title } = options;

    const ytDlp = await getYtDlpPath();
    if (!ytDlp) {
        throw new Error('yt-dlp binary not found. Install with: winget install yt-dlp.yt-dlp');
    }

    const env = { ...process.env };
    const ffmpegDir = await getFfmpegDir();
    if (ffmpegDir) {
        env.PATH = ffmpegDir + path.delimiter + (env.PATH || '');
    }

    const safeTitleBase = sanitizeFilename((title || 'download').substring(0, 50));
    const isWin = process.platform === 'win32';
    const dlId = Math.random().toString(36).substring(2, 10);

    let outputExt;
    if (audioOnly) {
        outputExt = (format || 'mp3').toLowerCase();
    } else {
        outputExt = 'mp4';
    }

    // yt-dlp output path — UUID-based so concurrent requests never clash.
    // yt-dlp will append the real extension automatically.
    const dlDir   = TEMP_DIR;
    const dlBase  = path.join(dlDir, `mp4tube_${dlId}`); // no extension — yt-dlp adds it
    const dlArgs  = [
        '--no-warnings',
        '--no-playlist',
        '--no-part',
        '--no-mtime',
        '--no-check-certificates',
        '--extractor-args', `youtube:player_client=${PLAYER_CLIENT_FALLBACKS}`,
        '-o', dlBase,
    ];

    if (audioOnly) {
        dlArgs.push('-x', '--audio-format', outputExt, '--audio-quality', mapAudioQuality(quality), '-f', 'bestaudio/best');
    } else {
        const height = parseInt(quality) || 1080;
        dlArgs.push('-f', `bestvideo[height<=?${height}]+bestaudio/best[height<=?${height}]/best`);
        const want = (format || 'mp4').toLowerCase();
        dlArgs.push('--merge-output-format', ['mp4', 'mkv', 'webm'].includes(want) ? want : 'mp4');
    }

    dlArgs.push(videoUrl);
    console.log('[yt-dlp] Starting download:', ytDlp, dlArgs.join(' '));

    // Spawn and immediately return — caller will stream the file once ready
    const child = spawn(ytDlp, dlArgs, { env });

    // Collect stderr for error reporting
    const stderrChunks = [];
    child.stderr.on('data', (c) => stderrChunks.push(c));
    child.on('error', (err) => console.error('[yt-dlp] spawn error:', err.message));

    // Wait for yt-dlp to finish writing the file (stable size = done)
    // The glob pattern finds whatever extension yt-dlp chose
    const globPattern = dlBase + (isWin ? '.*' : '*');
    let dlFile;

    try {
        dlFile = await waitForGlob(globPattern, {
            timeoutMs: 30 * 60 * 1000,
            stableMs: 2000,
            onCheck: (size) => console.log(`[yt-dlp] progress: ${(size / 1024 / 1024).toFixed(1)} MB…`),
        });
    } catch (err) {
        // If glob failed because yt-dlp exited with an error, surface that
        const stderr = stderrChunks.length ? Buffer.concat(stderrChunks).toString() : '';
        console.error('[yt-dlp] Download failed:', stderr);
        throw err;
    }

    const realExt = path.extname(dlFile).slice(1).toLowerCase() || outputExt;
    const realFilename = `${safeTitleBase || 'download'}.${realExt}`;
    const fileSize = fs.statSync(dlFile).size;

    console.log(`[yt-dlp] Done: ${dlFile} (${(fileSize / 1024 / 1024).toFixed(1)} MB, ext=${realExt})`);

    const stream = fs.createReadStream(dlFile);

    stream.on('end',    () => { setTimeout(() => cleanupFile(dlFile), 3000); });
    stream.on('error',  () => cleanupFile(dlFile));

    const cleanup = () => {
        try { child.kill(); } catch (_) {}
        cleanupFile(dlFile);
    };

    return {
        stream,
        filename:    realFilename,
        contentType: getContentType(realExt),
        contentLength: fileSize,
        cleanup,
    };
}

/**
 * Like waitForFile, but uses a glob pattern (via readdir) instead of a fixed path.
 * This is necessary because yt-dlp appends its own extension.
 */
function waitForGlob(pattern, { timeoutMs, stableMs, onCheck } = {}) {
    // Extract the base (no-extension part) from the glob pattern
    const isWin = process.platform === 'win32';
    let baseDir, baseName;
    if (isWin && pattern.includes('\\')) {
        const parts = pattern.split('\\');
        baseName = parts[parts.length - 1].replace(/\.\*$/, '');
        baseDir  = parts.slice(0, -1).join('\\');
    } else {
        const parts = pattern.split('/');
        baseName = parts[parts.length - 1].replace(/\.\*$/, '');
        baseDir  = parts.slice(0, -1).join('/');
    }

    return new Promise((resolve, reject) => {
        const start = Date.now();
        let prevSize = -1;
        let stableMs_ = 0;
        const INTERVAL = 500;
        let resultFile = null;

        const check = () => {
            try {
                const files = fs.readdirSync(baseDir)
                    .filter((f) => f.startsWith(baseName))
                    .map((f) => ({
                        name: f,
                        path: path.join(baseDir, f),
                        size: fs.statSync(path.join(baseDir, f)).size,
                        mtime: fs.statSync(path.join(baseDir, f)).mtimeMs,
                    }))
                    .sort((a, b) => b.mtime - a.mtime); // newest first

                if (files.length > 0) {
                    const newest = files[0];
                    onCheck && onCheck(newest.size);

                    if (newest.size > 0 && newest.size === prevSize) {
                        stableMs_ += INTERVAL;
                        if (stableMs_ >= stableMs) {
                            resultFile = newest.path;
                            return resolve(newest.path);
                        }
                    } else {
                        stableMs_ = 0;
                    }
                    prevSize = newest.size;
                }
            } catch (_) {}

            if (Date.now() - start > timeoutMs) {
                return reject(new Error(
                    `Timeout after ${Math.round(timeoutMs / 1000)}s. ` +
                    `YouTube may be rate-limiting you — wait a few minutes and try again.`));
            }

            setTimeout(check, INTERVAL);
        };

        check();
    });
}

function mapAudioQuality(quality) {
    const q = parseInt(quality) || 192;
    if (q >= 320) return '0';
    if (q >= 256) return '1';
    if (q >= 192) return '2';
    return '5';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
    getVideoInfo,
    downloadVideo,
    cleanupFile,
    isValidYouTubeUrl,
    getAvailableFormats,
    TEMP_DIR,
    getYtDlpPath,
    getFfmpegDir,
};
