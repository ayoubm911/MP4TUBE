export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    const { url } = req.body || {};
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL required' });
    }
    try {
        const backendUrl = process.env.BACKEND_URL;
        if (!backendUrl) {
            return res.status(503).json({
                success: false,
                error: 'Backend not configured. Set BACKEND_URL in Vercel environment variables.',
            });
        }
        const response = await fetch(backendUrl + '/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}
