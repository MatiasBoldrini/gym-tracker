import { NextResponse } from "next/server";
import { clearUserStore } from "@/lib/user-store";

export async function POST() {
    try {
        await clearUserStore();
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error logging out:", error);
        return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
    }
}

