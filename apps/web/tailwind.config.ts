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
        brand: {
          50: "#fdf8f0",
          100: "#faefd9",
          200: "#f3d9a8",
          300: "#e9be6e",
          400: "#dea040",
          500: "#c8852a",
          600: "#a96820",
          700: "#86501c",
          800: "#6d3f1d",
          900: "#5a351b",
        },
        surface: {
          DEFAULT: "#0f0f0f",
          50: "#1a1a1a",
          100: "#242424",
          200: "#2e2e2e",
          300: "#3a3a3a",
        },
        accent: {
          gold: "#E8C547",
          teal: "#5FC4C4",
          purple: "#B07EE8",
          red: "#E87070",
          green: "#A0C870",
          orange: "#F0A030",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(232,197,71,0)" },
          "50%": { boxShadow: "0 0 0 4px rgba(232,197,71,0.12)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease forwards",
        "fade-in": "fade-in 0.4s ease forwards",
        shimmer: "shimmer 2.5s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-in-left": "slide-in-left 0.35s ease forwards",
      },
    },
  },
  plugins: [],
};

export default config;
