import type { Metadata } from "next";
import "./globals.css";
import { BottomNav } from "@/components/navigation/BottomNav";

export const metadata: Metadata = {
    title: "Gym Tracker",
    description: "Minimalist Gym Routine Tracker",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className="bg-ios-background text-black min-h-[100dvh] overflow-x-hidden pb-[calc(var(--bottom-nav-base)+env(safe-area-inset-bottom))]">
                <main className="max-w-md mx-auto">
                    {children}
                </main>
                <BottomNav />
            </body>
        </html>
    );
}
