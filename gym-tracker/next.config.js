const withPWA = require("next-pwa")({
    dest: "public",
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === "development",
    // Importante (iOS): NO precachear todo el catálogo de imágenes.
    // Se cachean on-demand por runtimeCaching, y precacheamos selectivamente las de la rutina vía postMessage.
    publicExcludes: ["!images/exercises/**/*"],
    fallbacks: {
        document: "/offline.html",
    },
    runtimeCaching: [
        // Static assets from Next.js build
        {
            urlPattern: /^\/_next\/static\/.*/i,
            handler: "CacheFirst",
            options: {
                cacheName: "next-static-assets",
                expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
            },
        },
        // Exercise images
        {
            urlPattern: /\/images\/exercises\/.*/i,
            handler: "CacheFirst",
            options: {
                cacheName: "exercise-images",
                expiration: {
                    maxEntries: 300,
                    maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
            },
        },
        // Other static images
        {
            urlPattern: /\/images\/.*/i,
            handler: "CacheFirst",
            options: {
                cacheName: "static-images",
                expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
            },
        },
        // API: Sheets data (GET only) - StaleWhileRevalidate
        {
            urlPattern: ({ request, url }) => {
                return (
                    url.pathname.startsWith("/api/sheets/") &&
                    request.method === "GET"
                );
            },
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "sheets-api-cache",
                expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
            },
        },
        // API: Fatiga endpoint (GET only) - StaleWhileRevalidate
        {
            urlPattern: ({ request, url }) => {
                return (
                    url.pathname.startsWith("/api/fatiga") &&
                    request.method === "GET"
                );
            },
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "fatiga-api-cache",
                expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
            },
        },
        // API: Bodymap endpoint (GET only) - StaleWhileRevalidate
        {
            urlPattern: ({ request, url }) => {
                return (
                    url.pathname.startsWith("/api/bodymap") &&
                    request.method === "GET"
                );
            },
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "bodymap-api-cache",
                expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
            },
        },
    ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Force webpack for next-pwa compatibility (Turbopack doesn't support custom webpack configs yet)
    turbopack: {},
};

module.exports = withPWA(nextConfig);

