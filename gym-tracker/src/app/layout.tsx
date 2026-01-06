import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/navigation/BottomNav";

export const metadata: Metadata = {
    title: "Gym Tracker",
    description: "Minimalist Gym Routine Tracker",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "Gym Tracker",
    },
};

export const viewport: Viewport = {
    themeColor: "#000000",
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <head>
                <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
            </head>
            <body className="bg-ios-background text-black min-h-[100dvh] overflow-x-hidden pb-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))]">
                <main className="max-w-md mx-auto">
                    {children}
                </main>
                <BottomNav />
            </body>
        </html>
    );
}
