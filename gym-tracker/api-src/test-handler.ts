// Simple test handler for Vercel using Node.js HTTP format
import { IncomingMessage, ServerResponse } from 'http';

export default function handler(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        ok: true, 
        message: 'API is working',
        path: req.url
    }));
}
