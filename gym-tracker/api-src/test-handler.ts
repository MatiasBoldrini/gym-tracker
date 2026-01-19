// Simple test handler for Vercel
export default function handler(req: any, res: any) {
    res.status(200).json({ 
        ok: true, 
        message: 'API is working',
        path: req.url
    });
}
