# MP4Tube.video - Deployment Guide

## Step 1: Deploy Backend to Render.com

### 1.1 Push to GitHub
This project needs to be in a Git repo for Render to deploy it.

```bash
# In a terminal in this folder:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mp4tube-video.git
git push -u origin main
```

(If you don't have a GitHub account, create one at https://github.com/signup)

### 1.2 Deploy on Render
1. Go to https://render.com and sign in with GitHub
2. Click "New +" → "Blueprint"
3. Connect your repository `mp4tube-video`
4. Render will auto-detect the `render.yaml` file and configure:
   - Web service: Node.js
   - Free plan
   - Region: Oregon
   - Auto-deploy on every git push
5. Click "Apply" → wait for first deploy (~5 min)
6. Copy your service URL (e.g. `mp4tube-backend.onrender.com`)

### 1.3 Install yt-dlp and ffmpeg on Render
Render's free tier starts with a minimal image. Add a `Dockerfile` so we control the setup:

We'll create one for you below.

---

## Step 2: Connect Frontend to Backend

### 2.1 Set BACKEND_URL on Vercel
1. Go to https://vercel.com/dashboard
2. Select your project `mp4tube-video`
3. Settings → Environment Variables
4. Add: `BACKEND_URL` = `https://mp4tube-backend.onrender.com`
5. Save → Vercel will redeploy automatically

---

## Step 3: Connect Custom Domain mp4tube.video

### 3.1 In Vercel
1. Vercel dashboard → your project → Settings → Domains
2. Add `mp4tube.video` and `www.mp4tube.video`
3. Vercel will show you DNS records to add (e.g. `76.76.21.21` A record)

### 3.2 In Namecheap
1. Go to https://ap.www.namecheap.com/domains/list/
2. Click "Manage" next to mp4tube.video
3. Click "Advanced DNS" tab
4. Remove any existing A records / CNAME records
5. Add:
   - **A Record** | Host: @ | Value: `76.76.21.21` | TTL: Automatic
   - **CNAME Record** | Host: www | Value: `cname.vercel-dns.com` | TTL: Automatic
6. Save

Wait 5-30 minutes for DNS to propagate, then `https://mp4tube.video` will work!

---

## Step 4: SSL Certificate (Automatic)
Vercel auto-issues free SSL via Let's Encrypt once DNS resolves. No manual steps needed.

---

## Why this works
- **Vercel** hosts the static frontend (HTML/CSS/JS) - free tier
- **Render** runs the Node.js backend with yt-dlp + ffmpeg - free tier
- **Namecheap** handles DNS for your domain (you already own it)
- Vercel Serverless Functions proxy `/api/*` requests to Render backend
