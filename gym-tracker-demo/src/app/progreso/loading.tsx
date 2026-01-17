export default function LoadingProgreso() {
    return (
        <div className="px-5 pt-8 pb-10">
            <div className="h-9 w-40 bg-black/10 rounded-xl animate-pulse mb-2" />
            <div className="h-4 w-28 bg-black/10 rounded-lg animate-pulse mb-8" />

            <div className="ios-card p-4 mb-6 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black/10 rounded-full animate-pulse" />
                    <div className="h-4 flex-1 bg-black/10 rounded-lg animate-pulse" />
                </div>
            </div>

            <div className="ios-card overflow-hidden bg-white">
                <div className="bg-black px-4 py-4">
                    <div className="h-4 w-48 bg-white/20 rounded-lg animate-pulse" />
                </div>
                <div className="divide-y divide-black/5">
                    {Array.from({ length: 6 }).map((_, idx) => (
                        <div key={idx} className="p-4 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="h-3 w-40 bg-black/10 rounded-md animate-pulse mb-2" />
                                <div className="h-3 w-24 bg-black/10 rounded-md animate-pulse" />
                            </div>
                            <div className="w-20 h-8 bg-black/10 rounded-lg animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}











