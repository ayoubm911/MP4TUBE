# MP4Tube.video - YouTube Video & Audio Downloader

> Download YouTube videos and audio in any format and quality. **Powered by [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)**, the actively-maintained successor to youtube-dl that reliably handles YouTube's ever-changing player signatures.

## 🎯 What it does

A simple web app where the user pastes a YouTube URL, picks a format/quality, and gets a downloadable file. The Node.js server delegates all the YouTube extraction work to `yt-dlp` (a binary that lives on the host machine), then streams the resulting file to the browser.

## ✨ Features

- 🎬 **Video download** — MP4 / WebM / MKV, from 360p up to 4K
- 🎵 **Audio extraction** — MP3 / M4A / WAV at 128 / 192 / 256 / 320 kbps
- 🖼️ **Live preview** — title, thumbnail, duration, channel name
- 📱 **Responsive UI** — works on desktop and mobile, no build step
- 🧹 **Auto cleanup** — temp files are deleted after download

## 🛠 Architecture

```
Browser  ─►  Express server  ─►  yt-dlp (binary)  ─►  YouTube
              (Node.js)           (subprocess)
                  │
                  └── streams the result file back to the browser
```

The server is intentionally thin: **all YouTube-specific logic lives in `yt-dlp`**. We just spawn it, hand it the URL, and stream the output file back. This means:

- ✅ No npm package can break because YouTube rotated their JS player
- ✅ Supports 1000+ sites beyond YouTube (Vimeo, Twitter, TikTok, …) for free
- ✅ Trivial to upgrade: `yt-dlp -U` (or `pip install -U yt-dlp`)

### Project layout

```
mp4tube.video/
├── server/
│   ├── index.js              # Express bootstrap (port, middleware, static)
│   ├── routes/
│   │   └── api.js            # /api/info, /api/download, /api/health, /api/formats
│   ├── services/
│   │   └── youtube.js        # yt-dlp binary discovery + subprocess wrapper
│   └── utils/
│       └── helpers.js        # shared helpers (legacy — not used at runtime)
├── public/
│   ├── index.html            # single-page UI
│   ├── css/style.css         # design system + components
│   └── js/app.js             # fetch / download logic, no framework
├── scripts/
│   └── check-deps.js         # `npm run check-deps` — verifies yt-dlp+ffmpeg
├── package.json
├── README.md
└── .gitignore
```

## 🚀 Quick start

### Prerequisites
- **Node.js ≥ 18** (tested on Node 24)
- **`yt-dlp`** binary on PATH (see below)
- **`ffmpeg`** binary on PATH — recommended; required for audio extraction (MP3/M4A/WAV)

### Install yt-dlp

| OS | Command |
| --- | --- |
| **Windows** | `winget install yt-dlp.yt-dlp` (also installs `yt-dlp.FFmpeg`) |
| **macOS**   | `brew install yt-dlp ffmpeg` |
| **Linux**   | `sudo apt install yt-dlp ffmpeg`  (Ubuntu 22.04+)  *or* `pip install --user yt-dlp` (then add `~/.local/bin` to PATH) |

### Install ffmpeg (if you didn't get it with yt-dlp)

| OS | Command |
| --- | --- |
| **Windows** | `winget install yt-dlp.FFmpeg` |
| **macOS**   | `brew install ffmpeg` |
| **Linux**   | `sudo apt install ffmpeg` |

### Run

```bash
# 1. Verify your environment
npm run check-deps

# 2. Install Node deps (only express + cors — no native modules)
npm install

# 3. Start the server
npm start

# 4. Open http://localhost:3000
```

To run on a different port: `PORT=8080 npm start`

## 📡 API reference

All endpoints accept and return JSON unless noted.

### `GET /api/health`
Returns server status and the resolved path to the `yt-dlp` binary.

```json
{
  "success": true,
  "status": "ok",
  "ytDlpPath": "C:\\...\\yt-dlp.exe",
  "ytDlpAvailable": true,
  "timestamp": "2026-09-17T13:47:14.081Z"
}
```

### `POST /api/info`
Fetch video metadata for the URL the user pasted.

**Request body:**
```json
{ "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "title": "Me at the zoo",
    "thumbnail": "https://i.ytimg.com/vi_webp/.../maxresdefault.webp",
    "duration": 19,
    "uploader": "jawed",
    "viewCount": 432272066,
    "uploadDate": "20050424"
  }
}
```

### `POST /api/download`
Returns the file as a binary stream with `Content-Disposition: attachment`.

**Request body:**
```json
{
  "url":       "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "audio_only": false,
  "format":    "mp4",
  "quality":   "1080"
}
```

| Field        | Type    | Notes |
| ------------ | ------- | --- |
| `url`        | string  | Required. Validated against YouTube URL patterns. |
| `audio_only` | boolean | `true` → audio extraction mode (uses `yt-dlp -x`). |
| `format`     | string  | Video: `mp4` / `webm` / `mkv`.  Audio: `mp3` / `m4a` / `wav`. |
| `quality`    | string  | Video: `360`–`2160` (max height).  Audio: `128` / `192` / `256` / `320` (target kbps). |

**Errors:**

| Status | When | Response shape |
| ------ | ---- | -------------- |
| `400`  | URL missing or not a recognised YouTube URL | `{ "success": false, "error": "..." }` |
| `400`  | Request body is not valid JSON (e.g. broken quotes) | `{ "success": false, "error": "Invalid JSON in request body: ..." }` |
| `413`  | Request body exceeds 50 MB | `{ "success": false, "error": "Request body too large" }` |
| `500`  | yt-dlp failed to fetch metadata or download | `{ "success": false, "error": "..." }` |

> **Note for testers using `curl` / PowerShell:** PowerShell strips double-quotes when the body is passed inline as `--data "{...}"`. Use `--data-binary` with single-quoted JSON, or use Node's `http.request`, to keep the JSON intact. The browser-based UI always sends valid JSON via `fetch`.

### `GET /api/formats`
Static list of formats and qualities the UI offers. The frontend already knows these, but it's useful for third-party integrations.

```json
{
  "success": true,
  "data": {
    "video": ["mp4", "webm", "mkv"],
    "audio": ["mp3", "m4a", "wav"],
    "videoQualities": ["2160", "1440", "1080", "720", "480", "360"],
    "audioQualities": ["320", "256", "192", "128"]
  }
}
```

## ⚙️ How the backend actually works

`server/services/youtube.js` is a thin wrapper around the `yt-dlp` binary. It does three things:

1. **Resolve the binary path.** First try `yt-dlp` on `PATH` (via `where` / `which`). If that's empty — common on Windows right after a `winget` install because the shell hasn't refreshed its env yet — fall back to the known WinGet package directories.

2. **Get metadata.** Run `yt-dlp --dump-single-json --no-warnings --no-playlist <url>`, parse the JSON, pick the best thumbnail, and return a normalized object the frontend understands.

3. **Download to a temp file, then stream the file.** Output goes to `%TEMP%/mp4tube-downloads/<title>_<ts>.<ext>` rather than stdout. This is intentional — YouTube rarely serves a single progressive (video+audio) stream at higher qualities, so `yt-dlp` would normally pick separate video-only and audio-only streams and merge them with `ffmpeg`. `ffmpeg` **cannot merge from piped (non-seekable) inputs**, which is why a previous attempt to stream `yt-dlp`'s stdout to the HTTP response kept failing. Writing to a file first sidesteps that, and after the file exists we know the **actual** container YouTube delivered (often `webm` even when the user asked for `mp4`) and use that for the download filename.

The temp files are deleted automatically 5 s after the response finishes streaming, or immediately if the stream errors out.

## 🎨 UI design notes

The interface is a dark, glass-morphism single-page app inspired by the popular
"haze hero" landing-page pattern:

- **Animated background orbs** — three slow-drifting purple/pink glow blobs
  give the deep-navy background a sense of depth without ever distracting from
  the content (CSS keyframes only, no JS).
- **Sticky frosted top bar** with the `MP4Tube.video` wordmark
  (`MP4` in YouTube-red, `.video` in pink) and three text links
  (Features / How to Use / FAQ) that smooth-scroll to the matching sections.
- **Single hero card** — one focused glass card holds the entire flow:
  a pill-shaped URL input with a round gradient "fetch" button, the video
  preview, an Audio / Video toggle, two quality+format option grids, a live
  selection summary, and a big purple→pink gradient "Download Now" CTA.
- **Feature pills** under the card reinforce trust at a glance:
  *Lightning Fast* · *Multiple Formats* · *Safe & Free*, plus a
  green *"100% Free & Unlimited — No Sign-up"* badge.
- **Below the fold** the card disappears and the page reveals three more
  sections (Feature grid / 4-step "How to Use" / FAQ accordion) on the same
  dark background, so the user is never more than a scroll away from help.

Interaction details:

- Audio / Video toggle shows or hides the matching quality/format cards and
  updates the selection summary in real time.
- The selection summary shows the live choice, e.g.
  `🎬 Video · 1080p · MP4` or `🎵 Audio · High · 256 kbps · MP3`.
- The big CTA pulses with a shine animation on hover; a "shimmer" overlay
  sweeps across it.
- Toasts slide in from the top-right; the error banner sticks under the
  top bar. No build step — `Inter` from Google Fonts is the only network
  dependency; everything else is local CSS.

Built without a framework — `public/index.html` + `public/css/style.css` +
`public/js/app.js`. The hidden `<select>` elements stay the source of truth
for the form state (so the existing backend call shape doesn't change);
the visible buttons just keep them in sync.

## 🐳 Deploying to a real server

### ⚠️ Why NOT Vercel / Netlify / similar serverless

Vercel serverless functions have a **10-second execution limit** and don't allow long-lived subprocess streaming. YouTube downloads routinely take longer than that, and `yt-dlp` is a binary that needs to be installed on the host. So **this app needs a VM / VPS / container host** — any platform that lets you run a Node.js process and `apt install` system packages.

### Recommended hosts (all support `yt-dlp` + `ffmpeg`)

| Host | Notes |
| --- | --- |
| **A $5 VPS** (Hostinger / DigitalOcean / Vultr / Hetzner / Lightsail) | Cheapest, full control. Pick Ubuntu 22.04+. |
| **Railway.app / Fly.io / Render.com** | Easiest. Just push your repo and add a Dockerfile. |
| **Your own Linux box** | Perfect if you already have one. |

### One-shot deploy on a fresh Ubuntu VPS

```bash
# 1. SSH in
ssh root@YOUR_SERVER_IP

# 2. Install system deps
apt update && apt install -y nodejs npm ffmpeg python3-pip
pip3 install --break-system-packages yt-dlp    # latest stable

# 3. Copy your project (or git clone)
cd /opt
git clone <your-repo-url> mp4tube.video
cd mp4tube.video
npm install --omit=dev
npm run check-deps    # verify everything's good

# 4. Run with a process manager (PM2 keeps it alive + restarts on crash)
npm install -g pm2
PORT=3000 pm2 start server/index.js --name mp4tube
pm2 startup          # follow the printed instructions
pm2 save

# 5. Put it behind nginx + Let's Encrypt (free HTTPS)
apt install -y nginx certbot python3-certbot-nginx
# /etc/nginx/sites-available/mp4tube  → proxy_pass http://127.0.0.1:3000
ln -s /etc/nginx/sites-available/mp4tube /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com
```

### Hosting platforms that **don't** work
- ❌ Vercel / Netlify / Cloudflare Pages serverless functions — function timeouts + no `ffmpeg` / `yt-dlp`
- ❌ GitHub Pages / static-only hosts — **only the frontend can be hosted; the backend cannot run here**

### Vercel (static frontend only)

[Vercel](https://vercel.com) is great for static hosting — works almost identically to VibeHost for this project. Same caveat: only the frontend is served, the Node.js + `yt-dlp` backend cannot run there, so visitors will see the friendly "backend not running" message when they try to download.

**Method 1 — drag & drop (fastest)**

1. Make sure the latest frontend is built:
   ```bash
   npm run build:static
   ```
2. Go to [vercel.com/new](https://vercel.com/new) and sign in
3. Choose **"Import Folder"** or drag & drop the `dist/` folder
4. Click **Deploy** — done in seconds

**Method 2 — via GitHub (for ongoing updates)**

1. Push this project to a GitHub repo
2. On [vercel.com/new](https://vercel.com/new), click **"Import Git Repository"** and pick the repo
3. Vercel auto-detects the static project — set:
   - **Output Directory**: `dist`
   - **Build Command**: `npm run build:static` (optional — Vercel can also use the existing `dist/` directly)
4. Click **Deploy**. Every push to `main` will trigger a redeploy

The included `vercel.json` configures:
- `outputDirectory: "dist"` — Vercel serves from here
- `cleanUrls: false` — keeps `.html` extensions
- A wildcard rewrite so 404s fall back to `404.html`

**What your visitors will see**

- ✅ Full homepage — title, the big centered URL bar, format/quality cards, Features, How-to, FAQ, Footer
- ⚠️ When they try to fetch a video or click Download, they'll get:
  > "This is the static frontend only. The download backend is not running on this host. Run locally with: npm start"
- ⚠️ Any unknown URL like `/random-page` shows the custom 404 page

**To enable real downloads**, you need a host that supports Node.js + `yt-dlp` — see the [Recommended hosts](#recommended-hosts-all-support-yt-dlp--ffmpeg) section above.


## 🛡️ Legal & ethical note

MP4Tube.video is a **technical demonstration**. Downloading copyrighted material from YouTube without permission violates YouTube's Terms of Service in most jurisdictions. Please only download content you own or that is explicitly offered under a Creative Commons / public-domain license. The authors of this project are not responsible for user actions.

## 🐛 Troubleshooting

**`yt-dlp` not found / 500 on first request**
Run `npm run check-deps` and follow the printed install instructions. On Windows, you may need to **close and reopen your terminal** after `winget install` so the new PATH is picked up.

**Download starts then connection resets / browser shows partial file**
Your YouTube IP may be rate-limited. Wait 5–10 minutes and try again. Try a shorter or less popular video. YouTube rotates its limits based on usage patterns.

**"Timeout waiting for download" error**
Same as above — YouTube is temporarily rate-limiting you. The download will start once the limit clears.

**MP3 / M4A audio downloads fail with "ffmpeg not found"**
Install ffmpeg (see the table above). yt-dlp uses it to extract and re-encode audio. The WinGet install: `winget install yt-dlp.FFmpeg`

**Video downloads return 0 bytes or browser times out**
✅ **Fixed** — the backend now streams the file to the browser as soon as yt-dlp finishes writing it. If you still see this, try a different (shorter) video first.

**"Sign in to confirm you're not a bot" error**
YouTube occasionally asks `yt-dlp` to use cookies. The fix is `yt-dlp --cookies-from-browser firefox` (or similar) on the host. We're not bundling cookie support because it varies by environment.

**Private / age-restricted / region-locked videos don't work**
Some YouTube videos cannot be downloaded — this is a YouTube restriction, not a bug in this app. Try a different video that is publicly available.

## ✅ Verified working (2026-09-18)

| Test | Result |
|------|--------|
| `POST /api/info` — "Me at the zoo" | ✅ 200, returned correct metadata in ~10s |
| `POST /api/download` — 360p MP4 | ✅ 200, valid MP4 file (475 KB) |
| yt-dlp version | 2026.08.19 |
| ffmpeg available | ✅ yes |
| Audio extraction (MP3) | ✅ requires ffmpeg |

## 📄 License

MIT — for educational use. Not affiliated with YouTube / Google.
