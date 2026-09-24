# Export YouTube Cookies from Chrome (Manual Steps)

## Why YouTube is blocking downloads

YouTube has detected that our server makes too many automated requests from your IP and is now showing a "Sign in to confirm you're not a bot" error. To bypass this, we need to give yt-dlp your real browser cookies so YouTube thinks a real human is downloading.

## How to export your cookies (do this once)

### Step 1: Make sure you're logged into YouTube in Chrome
- Open Chrome and go to https://youtube.com
- Confirm you're signed in (your profile picture in the top-right)

### Step 2: Install a cookie-export extension
1. Open Chrome Web Store: https://chrome.google.com/webstore
2. Search for **"Get cookies.txt LOCALLY"**
3. Click "Add to Chrome" on the one by **"fullstackdev"** (or similar — this is a popular extension that exports cookies locally)
4. Confirm permissions

### Step 3: Export your cookies
1. While on the YouTube page (or any YouTube video), click the extension icon
2. Click **"Export"** or **"Download"** — this saves a `cookies.txt` file
3. **Important:** Move the downloaded file to: `C:\Users\Ayoub\Desktop\mp4tube.video\cookies.txt`

### Step 4: Tell me when done
Once the file is in place, just reply **"cookies.txt is ready"** and I'll update the server to use it.

---

## Alternative: Use Edge or Brave instead
You can do the same process in Microsoft Edge (same Cookie-Editor extensions exist) — the cookies file from any browser works because YouTube trusts your Google account session regardless of which browser.

## Alternative: Just wait
YouTube's IP block clears automatically after **15-60 minutes** of inactivity. If you're not in a hurry, close Cursor's preview tabs and just wait. Downloads will work again without any cookies.

## Need a different approach?
If neither option works for you, the site can also work using cookies extracted by the background "Cookiebro" or "EditThisCookie" extensions — same idea, just a different extension.
