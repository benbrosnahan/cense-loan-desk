import type { Config } from "tailwindcss";

// Cense brand palette, carried over verbatim from Loan Lab so the two tools
// read as one product. The neutral ramp intentionally overrides Tailwind's
// stock `slate` so slate-* classes pick up the warm green-on-cream theme.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: "#F6F3E1",
          100: "#EAF3E7",
          200: "#DCE7D8",
          300: "#BFDCB8",
          400: "#8CA98E",
          500: "#5C7F5F",
          600: "#4A6E4D",
          700: "#3A6B3E",
          800: "#2F6133",
          900: "#275B2D",
        },
        navy: { DEFAULT: "#275B2D", hover: "#1E4623" },
        brand: {
          DEFAULT: "#275B2D",
          hover: "#1E4623",
          light: "#EAF3E7",
          border: "#BFDCB8",
        },
        accent: {
          DEFAULT: "#C1652E",
          hover: "#A8531F",
          light: "#F7E4D6",
        },
        page: "#FFFCEC",
        line: "#DCE7D8",
        selected: "#EAF3E7",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
