import type { Config } from "tailwindcss";

/**
 * Spatial round. Colours are unchanged and still ratified by
 * `docs/05-design/DESIGN-CONTRACT.md` lines 32 to 35.
 *
 * The six `boxShadow` stacks are the five layer ambient occlusion from
 * `UI-UX-Fix-Prompts/00-CONTRACTS.md` section 3, and they are the same literals
 * as the `--shadow-z-*` custom properties in `app/globals.css`. Both copies
 * exist so `shadow-raised` works without a stylesheet load order dependency and
 * so `.depth-raised` works without Tailwind's JIT. Duplication is a bug class
 * this project hunts, so `lib/ui-guard/spatial-primitives.test.ts` asserts the
 * two sources agree and fails the build if they drift.
 */
const INK = "24, 32, 43";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18202B",
        muted: "#667085",
        line: "#DDE3EA",
        canvas: "#F4F6F8",
        blue: "#175CD3",
        blueSoft: "#E8F0FF",
        green: "#087443",
        greenSoft: "#E8F5EE",
        amber: "#A15C07",
        amberSoft: "#FFF4D6",
      },
      boxShadow: {
        /* The recession shadow. The only inset one, and the most important. */
        recessed: `inset 0 2px 4px rgba(${INK}, 0.05), inset 0 1px 1px rgba(${INK}, 0.04)`,
        flush: `0 1px 2px rgba(${INK}, 0.04)`,
        raised: `0 1px 2px rgba(${INK}, 0.05), 0 2px 4px rgba(${INK}, 0.04), 0 4px 8px rgba(${INK}, 0.03)`,
        lifted:
          `0 1px 2px rgba(${INK}, 0.05), 0 2px 6px rgba(${INK}, 0.05), ` +
          `0 6px 12px rgba(${INK}, 0.04), 0 12px 24px rgba(${INK}, 0.03)`,
        floating:
          `0 2px 4px rgba(${INK}, 0.05), 0 4px 10px rgba(${INK}, 0.05), ` +
          `0 10px 20px rgba(${INK}, 0.04), 0 20px 40px rgba(${INK}, 0.04), ` +
          `0 32px 64px rgba(${INK}, 0.03)`,
        foreground:
          `0 4px 8px rgba(${INK}, 0.05), 0 8px 20px rgba(${INK}, 0.05), ` +
          `0 16px 40px rgba(${INK}, 0.04), 0 32px 80px rgba(${INK}, 0.04), ` +
          `0 48px 120px rgba(${INK}, 0.03)`,
        card: `0 1px 2px rgba(${INK}, 0.05), 0 2px 4px rgba(${INK}, 0.04), 0 4px 8px rgba(${INK}, 0.03)`,
        float:
          `0 2px 4px rgba(${INK}, 0.05), 0 4px 10px rgba(${INK}, 0.05), ` +
          `0 10px 20px rgba(${INK}, 0.04), 0 20px 40px rgba(${INK}, 0.04), ` +
          `0 32px 64px rgba(${INK}, 0.03)`,
      },
      fontSize: {
        micro: ["11px", { lineHeight: "16px" }],
        meta: ["12px", { lineHeight: "20px" }],
        bodySm: ["13px", { lineHeight: "20px" }],
        /* Alias. The design doc writes `text-body-sm`, tokens.ts writes `text-bodySm`. */
        "body-sm": ["13px", { lineHeight: "20px" }],
        body: ["15px", { lineHeight: "24px" }],
        lead: ["17px", { lineHeight: "28px" }],
        title: ["21px", { lineHeight: "28px" }],
        display: ["28px", { lineHeight: "34px" }],
      },
      /* `p-13` and `p-17` exist so `p-[13px]` and `p-[17px]` stop appearing. */
      spacing: {
        13: "13px",
        17: "17px",
      },
      borderRadius: {
        chip: "2px",
        input: "4px",
        card: "6px",
      },
      zIndex: {
        sticky: "10",
        dropdown: "20",
        popup: "30",
        sheet: "40",
        skip: "50",
      },
      /* 120ms hover and focus, 200ms state, 320ms scene. Nothing else. */
      transitionDuration: {
        120: "120ms",
        200: "200ms",
        320: "320ms",
      },
    },
  },
  plugins: [],
};

export default config;
