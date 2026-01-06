export default function LoadingFatiga() {
    return (
        <div className="px-5 pt-8 pb-10">
            <div className="h-9 w-32 bg-black/10 rounded-xl animate-pulse mb-2" />
            <div className="h-4 w-44 bg-black/10 rounded-lg animate-pulse mb-8" />

            <div className="ios-card p-6 mb-8 bg-white">
                <div className="h-4 w-24 bg-black/10 rounded-lg animate-pulse mb-4" />
                <div className="h-[400px] w-full bg-black/10 rounded-2xl animate-pulse" />
            </div>

            <div className="ios-card overflow-hidden bg-white">
                <div className="bg-black px-4 py-4">
                    <div className="h-4 w-40 bg-white/20 rounded-lg animate-pulse" />
                </div>
                <div className="p-4 space-y-3">
                    <div className="h-4 w-3/4 bg-black/10 rounded-lg animate-pulse" />
                    <div className="h-4 w-2/3 bg-black/10 rounded-lg animate-pulse" />
                    <div className="h-4 w-4/5 bg-black/10 rounded-lg animate-pulse" />
                    <div className="h-4 w-1/2 bg-black/10 rounded-lg animate-pulse" />
                </div>
            </div>
        </div>
    );
}










