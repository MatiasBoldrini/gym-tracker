import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                ios: {
                    blue: "#007AFF",
                    green: "#34C759",
                    red: "#FF3B30",
                    orange: "#FF9500",
                    yellow: "#FFCC00",
                    gray: "#8E8E93",
                    lightGray: "#E5E5EA",
                    background: "#F2F2F7",
                },
            },
            borderRadius: {
                "ios-xl": "20px",
                "ios-lg": "12px",
            },
            boxShadow: {
                ios: "0 4px 12px rgba(0, 0, 0, 0.05)",
            },
        },
    },
    plugins: [],
};
export default config;
