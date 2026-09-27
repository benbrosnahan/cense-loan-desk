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
        // Chart marks only. `green` is the brand green nudged until it clears
        // every check in the palette validator against `orange`, including
        // protanopia separation (9.4). Lighter greens collide with the orange
        // for red-green colorblind readers, so do not brighten it.
        chart: {
          green: "#26602D",
          orange: "#C1652E",
          mute: "#A9C3AA",
          track: "#EAF3E7",
          grid: "#E4ECE0",
        },
        page: "#FFFCEC",
        line: "#DCE7D8",
        selected: "#EAF3E7",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: [
          "var(--font-display)",
          "var(--font-sans)",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        // The floor. Nothing in the interface is set smaller than this.
        xs: ["0.8125rem", { lineHeight: "1.2rem" }],
      },
      boxShadow: {
        card: "0 1px 0 rgba(39, 91, 45, 0.04), 0 8px 24px -12px rgba(39, 91, 45, 0.18)",
        lift: "0 1px 0 rgba(39, 91, 45, 0.05), 0 16px 32px -16px rgba(39, 91, 45, 0.28)",
      },
    },
  },
  plugins: [],
};
export default config;
