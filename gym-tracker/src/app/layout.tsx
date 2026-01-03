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
            <body className="bg-ios-background text-black min-h-screen pb-24">
                <main className="max-w-md mx-auto min-h-screen">
                    {children}
                </main>
                <BottomNav />
            </body>
        </html>
    );
}
