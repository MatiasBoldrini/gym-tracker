import { Loader2 } from "lucide-react";

export default function RutinaLoading() {
    return (
        <div className="min-h-[calc(100dvh-(var(--bottom-nav-base)+env(safe-area-inset-bottom)))] w-full flex flex-col items-center justify-center bg-[#F2F2F7]">
            <Loader2 className="w-8 h-8 animate-spin text-ios-blue" />
            <p className="mt-4 text-gray-500 font-medium">Cargando editor...</p>
        </div>
    );
}
