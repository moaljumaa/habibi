import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./ee/pages/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Notion's dark palette. Near-black page, slightly lifted panels, hairline dividers —
        // contrast comes from elevation and type weight, not from boxes and borders.
        bg: "#191919",
        panel: "#202020",
        raised: "#2a2a2a",
        line: "#2f2f2f",
        ink: "#e6e6e5",
        muted: "#9b9a97",
        faint: "#6b6b6a",
        accent: "#2383e2",
        danger: "#eb5757",
        ok: "#4dab6d",
        soft: "#232323", // subtle fill: bars, chips, hover
      },
      fontFamily: {
        // Identifiers (model ids, keys, domains) are set in mono — they're exact strings meant
        // to be compared character by character, not read as prose.
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
