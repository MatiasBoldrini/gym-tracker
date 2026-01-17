import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const response = await fetch("https://bodymap-api.vercel.app/api/bodymap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`External API responded with ${response.status}`);
        }

        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=3600'
            }
        });
    } catch (error: any) {
        console.error("BodyMap Proxy Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
