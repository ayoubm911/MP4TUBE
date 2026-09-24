#!/usr/bin/env bash
# render-startup.sh — runs on Render.com before npm start
# Installs yt-dlp + ffmpeg so the download backend works.

set -e

echo "=== Render startup: installing yt-dlp + ffmpeg ==="

# yt-dlp (Python tool — Render's free tier has Python)
pip install -U yt-dlp --quiet

# ffmpeg (binary, system-level)
if ! command -v ffmpeg &>/dev/null; then
    echo "Installing ffmpeg..."
    apt-get update -qq && apt-get install -y -qq ffmpeg > /dev/null 2>&1
fi

ffmpeg -version | head -1
yt-dlp --version

echo "=== Starting Node.js server ==="
exec npm start
