type PerfSnapshot = {
    ts: string;
    nav?: {
        ttfb?: number;
        domContentLoaded?: number;
        load?: number;
    };
    fcp?: number;
    resources?: Array<{ name: string; duration: number }>;
};

export function logBaselineMetrics() {
    if (typeof window === "undefined" || typeof performance === "undefined") return;

    const snapshot: PerfSnapshot = { ts: new Date().toISOString() };
    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navEntry) {
        snapshot.nav = {
            ttfb: Math.round(navEntry.responseStart - navEntry.requestStart),
            domContentLoaded: Math.round(navEntry.domContentLoadedEventEnd - navEntry.startTime),
            load: Math.round(navEntry.loadEventEnd - navEntry.startTime),
        };
    }

    const fcpEntry = performance.getEntriesByName("first-contentful-paint")[0] as PerformanceEntry | undefined;
    if (fcpEntry) {
        snapshot.fcp = Math.round(fcpEntry.startTime);
    }

    const resources = performance
        .getEntriesByType("resource")
        .filter((r) => (r as PerformanceResourceTiming).initiatorType !== "img")
        .slice(0, 50)
        .map((r) => ({ name: new URL(r.name).pathname, duration: Math.round(r.duration) }));
    snapshot.resources = resources;

    console.info("[perf] snapshot", snapshot);
}
