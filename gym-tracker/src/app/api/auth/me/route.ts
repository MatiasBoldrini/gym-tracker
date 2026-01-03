import { NextResponse } from "next/server";
import { getUserStore, isUserAuthenticated } from "@/lib/user-store";

export async function GET() {
    try {
        const store = await getUserStore();
        const authenticated = isUserAuthenticated(store);
        const spreadsheetId = store.spreadsheetId;

        return NextResponse.json({
            authenticated,
            hasSpreadsheet: !!spreadsheetId,
            spreadsheetId: spreadsheetId || null,
        });
    } catch (error) {
        console.error("Error getting session:", error);
        return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
    }
}

