import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next 16: `middleware.ts` está deprecado → usar `proxy.ts`.
 * Proxy corre en runtime Node.js y se ejecuta por request según el matcher.
 */
export async function proxy(request: NextRequest) {
    return await updateSession(request);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api (API routes handle auth with server helpers; avoid extra latency on every API call)
         * - public folder
         */
        "/((?!_next/static|_next/image|favicon.ico|icons|images|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};

