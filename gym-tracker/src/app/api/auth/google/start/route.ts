import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google/oauth";

export async function GET() {
    try {
        const authUrl = getAuthUrl();
        return NextResponse.redirect(authUrl);
    } catch (error) {
        console.error("Error starting Google auth:", error);
        return NextResponse.json(
            { error: "Failed to start authentication" },
            { status: 500 }
        );
    }
}




