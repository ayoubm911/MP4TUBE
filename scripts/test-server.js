// Static test server with API proxy
// - Serves files from public/dist
// - Proxies /api/* to the cloudflared tunnel
//   (or falls back to localhost:3000 if tunnel is down)
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.resolve(process.argv[2]);
const BACKEND = process.argv[3] || 'https://clark-brussels-experiment-introductory.trycloudflare.com';
const PORT = Number(process.argv[4] || 8000);

const mimes = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.json': 'application/json',
};

console.log('Serving from :', DIST);
console.log('Backend URL :', BACKEND);
console.log('Port        :', PORT);

const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];

            // ---- Proxy /api/* to backend ----
            if (url.startsWith('/api/')) {
                const targetUrl = BACKEND + url;
                try {
                    const opts = {
                        method: req.method,
                        headers: { 'Content-Type': 'application/json' },
                    };
                    let body;
                    if (req.method !== 'GET' && req.method !== 'HEAD') {
                        body = await new Promise((resolve, reject) => {
                            const chunks = [];
                            req.on('data', (c) => chunks.push(c));
                            req.on('end',  () => resolve(Buffer.concat(chunks)));
                            req.on('error', reject);
                        });
                        if (body && body.length) opts.body = body;
                    }

                    // Pipe upstream bytes through to the client instead of
                    // reading the whole body into a string (that would mangle
                    // binary downloads — MP4/WebM/MP3 contain non-UTF-8 bytes).
                    const upstream = await fetch(targetUrl, opts);
                    const headers = { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' };
                    const cl = upstream.headers.get('Content-Length');
                    const cd = upstream.headers.get('Content-Disposition');
                    const cb = upstream.headers.get('Cache-Control');
                    const xab = upstream.headers.get('X-Accel-Buffering');
                    if (cl) headers['Content-Length'] = cl;
                    if (cd) headers['Content-Disposition'] = cd;
                    if (cb) headers['Cache-Control'] = cb;
                    if (xab) headers['X-Accel-Buffering'] = xab;

                    res.writeHead(upstream.status, headers);
                    if (upstream.body) {
                        // node-fetch's body is a Node Readable; pipe it straight through
                        const { Readable } = require('stream');
                        Readable.fromWeb(upstream.body).pipe(res);
                    } else {
                        res.end();
                    }
                } catch (err) {
                    if (!res.headersSent) {
                        res.writeHead(502, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: 'Local proxy error: ' + err.message,
                        }));
                    } else {
                        try { res.end(); } catch (_) {}
                    }
                }
                return;
            }

    // ---- Serve static file ----
    let filePath = url === '/' ? '/index.html' : url;
    filePath = path.join(DIST, filePath);
    if (!filePath.startsWith(DIST)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Not found: ' + url }));
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, () => console.log('Test server on http://localhost:' + PORT));
