export default function Loading() {
    return (
        <div className="px-5 pt-8 pb-10">
            <div className="h-9 w-40 bg-black/10 rounded-xl animate-pulse mb-2" />
            <div className="h-4 w-52 bg-black/10 rounded-lg animate-pulse mb-8" />

            <div className="ios-card p-6 bg-white">
                <div className="h-5 w-28 bg-black/10 rounded-lg animate-pulse mb-4" />
                <div className="h-40 w-full bg-black/10 rounded-2xl animate-pulse" />
                <div className="mt-4 space-y-3">
                    <div className="h-4 w-3/4 bg-black/10 rounded-lg animate-pulse" />
                    <div className="h-4 w-2/3 bg-black/10 rounded-lg animate-pulse" />
                    <div className="h-4 w-1/2 bg-black/10 rounded-lg animate-pulse" />
                </div>
            </div>
        </div>
    );
}




