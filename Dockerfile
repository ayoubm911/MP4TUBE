FROM node:20-bookworm-slim

# Install yt-dlp and ffmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        ffmpeg \
        ca-certificates \
        curl && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Expose the port Render expects
EXPOSE 10000

# Self-update yt-dlp on every container start, THEN launch the server.
# Render keeps containers running for weeks — without this, the binary
# baked in at build time goes stale and YouTube breaks it within days.
CMD ["sh", "-c", "yt-dlp -U && node server/index.js"]
