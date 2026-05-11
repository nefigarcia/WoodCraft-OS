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
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
