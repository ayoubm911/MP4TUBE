export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
        return res.json({
            status: 'ok',
            mode: 'frontend-only',
            message: 'Backend URL not configured. Set BACKEND_URL in Vercel env vars.',
        });
    }
    try {
        const response = await fetch(backendUrl + '/api/health');
        const data = await response.json();
        return res.json({ status: 'ok', mode: 'proxied', backend: data });
    } catch (err) {
        return res.status(503).json({ status: 'degraded', error: err.message });
    }
}
