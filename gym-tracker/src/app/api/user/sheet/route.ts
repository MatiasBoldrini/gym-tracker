import { NextRequest, NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated, updateUserStore } from "@/lib/user-store";

// Extract spreadsheet ID from various URL formats
function extractSpreadsheetId(input: string): string | null {
    // If it's already just an ID (no slashes, reasonable length)
    if (/^[a-zA-Z0-9_-]{20,50}$/.test(input.trim())) {
        return input.trim();
    }

    // Try to extract from URL
    // Formats:
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

export async function GET() {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store)) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        return NextResponse.json({ spreadsheetId: store.spreadsheetId || null });
    } catch (error) {
        console.error("Error getting spreadsheet ID:", error);
        return NextResponse.json({ error: "Failed to get spreadsheet" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const store = await getUserStore();
        if (!isUserAuthenticated(store)) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const body = await request.json();
        const { spreadsheetUrl } = body;

        if (!spreadsheetUrl || typeof spreadsheetUrl !== "string") {
            return NextResponse.json(
                { error: "spreadsheetUrl is required" },
                { status: 400 }
            );
        }

        const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
        if (!spreadsheetId) {
            return NextResponse.json(
                { error: "Invalid spreadsheet URL or ID" },
                { status: 400 }
            );
        }

        await updateUserStore({ spreadsheetId });

        return NextResponse.json({ ok: true, spreadsheetId });
    } catch (error) {
        console.error("Error saving spreadsheet ID:", error);
        return NextResponse.json({ error: "Failed to save spreadsheet" }, { status: 500 });
    }
}

