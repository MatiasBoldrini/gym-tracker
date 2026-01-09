import { NextResponse } from "next/server";
import { createClient, getUserIntegration } from "@/lib/supabase/server";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({
                authenticated: false,
                hasSpreadsheet: false,
                spreadsheetId: null,
            });
        }

        const integration = await getUserIntegration();

        return NextResponse.json({
            authenticated: true,
            hasSpreadsheet: !!integration?.spreadsheet_id,
            spreadsheetId: integration?.spreadsheet_id || null,
            email: user.email || null,
        });
    } catch (error) {
        console.error("Error getting session:", error);
        return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
    }
}
