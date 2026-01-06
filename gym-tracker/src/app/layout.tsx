import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/navigation/BottomNav";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
    title: "Gym Tracker",
    description: "Minimalist Gym Routine Tracker",
    manifest: "/manifest.webmanifest",
    icons: {
        icon: [
            { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
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
            <body className="bg-ios-background text-black min-h-[100dvh] overflow-x-hidden pb-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))]">
                <PwaRegister />
                <main className="max-w-md mx-auto">
                    {children}
                </main>
                <BottomNav />
            </body>
        </html>
    );
}
