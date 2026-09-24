/**
 * scripts/check-deps.js
 *
 * Verifies the system has everything MP4Tube.video needs to run:
 *   - Node.js >= 18
 *   - yt-dlp on PATH (or in a known WinGet location)
 *   - ffmpeg (optional but recommended for audio conversion)
 *
 * Exits 0 if everything's good, prints helpful install instructions otherwise.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function which(bin) {
    return new Promise((resolve) => {
        const finder = process.platform === 'win32' ? 'where' : 'which';
        execFile(finder, [bin], (err, stdout) => {
            if (err) return resolve(null);
            const first = stdout.toString().split(/\r?\n/)[0].trim();
            resolve(first || null);
        });
    });
}

async function findYtDlp() {
    const fromPath = await which('yt-dlp');
    if (fromPath) return fromPath;

    // WinGet fallback locations
    if (process.platform === 'win32') {
        const candidates = [
            path.join(os.homedir(),
                'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages',
                'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe',
                'yt-dlp.exe'),
        ];
        for (const c of candidates) {
            if (fs.existsSync(c)) return c;
        }
    }
    return null;
}

async function main() {
    let ok = true;

    // Node version
    const major = parseInt(process.versions.node.split('.')[0], 10);
    console.log(`Node.js: v${process.versions.node}  ${major >= 18 ? '[OK]' : '[FAIL - need >= 18]'}`);
    if (major < 18) ok = false;

    // yt-dlp
    const ytDlp = await findYtDlp();
    if (ytDlp) {
        console.log(`yt-dlp:  ${ytDlp}  [OK]`);
    } else {
        ok = false;
        console.log('yt-dlp:  [MISSING]');
        console.log('');
        console.log('Install yt-dlp:');
        if (process.platform === 'win32') {
            console.log('  winget install yt-dlp.yt-dlp');
            console.log('  or:  pip install yt-dlp');
        } else if (process.platform === 'darwin') {
            console.log('  brew install yt-dlp');
            console.log('  or:  pip3 install --user yt-dlp');
        } else {
            console.log('  sudo apt install yt-dlp  (Ubuntu 22.04+)');
            console.log('  or:  pip install --user yt-dlp   (then add ~/.local/bin to PATH)');
        }
    }

    // ffmpeg (optional but recommended)
    const ffmpeg = await which('ffmpeg');
    if (ffmpeg) {
        console.log(`ffmpeg:  ${ffmpeg}  [OK]`);
    } else {
        console.log('ffmpeg:  [MISSING - optional]');
        console.log('  Without ffmpeg, MP3/M4A/WAV audio conversions may not work.');
        if (process.platform === 'win32') {
            console.log('  Install:  winget install yt-dlp.FFmpeg');
        } else if (process.platform === 'darwin') {
            console.log('  Install:  brew install ffmpeg');
        } else {
            console.log('  Install:  sudo apt install ffmpeg');
        }
    }

    console.log('');
    if (ok) {
        console.log('All required dependencies present. Run:  npm start');
        process.exit(0);
    } else {
        console.log('Some required dependencies are missing.');
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('check-deps failed:', err);
    process.exit(1);
});
