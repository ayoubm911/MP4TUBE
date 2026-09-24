export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
        return res.status(503).json({
            success: false,
            error: 'Backend not configured. Set BACKEND_URL in Vercel environment variables.',
        });
    }
    try {
        const response = await fetch(backendUrl + '/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {}),
        });

        // Forward response headers and body
        const headersToForward = {};
        response.headers.forEach((value, key) => {
            const lower = key.toLowerCase();
            if (!['content-encoding', 'transfer-encoding', 'connection'].includes(lower)) {
                headersToForward[key] = value;
            }
        });
        Object.entries(headersToForward).forEach(([k, v]) => res.setHeader(k, v));

        res.status(response.status);
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}
