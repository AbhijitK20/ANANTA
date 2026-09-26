import type { Config } from "tailwindcss";

/**
 * The ratified palette, declared here and consumed from the stylesheet.
 *
 * `lib/ui-guard/a11y-primitives.test.ts` reads these ten literals out of this
 * file, checks the contrast of six pairs, and `spatial-primitives.test.ts` reads
 * `ink` to prove the palette and the shadow stacks agree on one ink. So these
 * are a declaration of record: the values below are the light theme, and
 * `app/globals.css` holds the same ten values as custom properties.
 *
 * The colour utilities do not inline these hexes. They read the custom
 * properties, which is the only reason one config can serve two themes: a dark
 * theme is a different set of values behind the same property names, and the
 * 200-odd `text-ink` and `bg-canvas` call sites across pages this session does
 * not own become theme-aware with no edit to any of them.
 *
 * A literal left in the utilities is a colour that cannot change with the
 * theme. Two of them still exist and both are named in the blockers file.
 */

export const RATIFIED_LIGHT = {
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
} as const;

/** The ink the six shadow stacks are mixed from. Frozen by two guard tests. */
const INK = "24, 32, 43";

/**
 * A themed colour. `rgb(var(--ink-rgb) / <alpha-value>)` keeps the slash
 * opacity working, so `bg-blue/40` and `text-muted/70` still compile.
 */
const themed = (token: string): string => `rgb(var(--${token}-rgb) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  /**
   * `media` is the default and it is also the mechanism the stylesheet uses, so
   * the `dark:` variants and the custom property swap cannot disagree: both ask
   * the same question of the same media query. A class strategy here would
   * leave the properties on the light theme until something set the class.
   */
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        /**
         * The seven roles the contract names, plus the two it implies. Read
         * from the stylesheet so a theme change needs no edit here.
         */
        ink: themed("ink"),
        muted: themed("muted"),
        line: themed("line"),
        canvas: themed("canvas"),
        blue: themed("blue"),
        blueSoft: themed("blue-soft"),
        green: themed("green"),
        greenSoft: themed("green-soft"),
        amber: themed("amber"),
        amberSoft: themed("amber-soft"),
        /**
         * `surface` is the card and page-frame colour. It exists because
         * `bg-white` is a hardcoded white in 79 places and cannot follow a
         * theme. New code says `bg-surface`; the migration is one word per site
         * and belongs to whoever owns the page.
         */
        surface: themed("surface"),
        /**
         * The on-fill text colour, for a saturated accent or status fill.
         * White in the light theme, near-black in the dark one, because a dark
         * theme needs a lighter accent and white on a light accent is 2.46 to 1.
         */
        onAccent: "var(--color-on-accent)",
      },
      /**
       * The six `boxShadow` stacks are the five layer ambient occlusion from
       * `UI-UX-Fix-Prompts/00-CONTRACTS.md` section 3, and they are the same
       * literals as the `--shadow-z-*` custom properties in `app/globals.css`.
       * Both copies exist so `shadow-raised` works without a stylesheet load
       * order dependency and so `.depth-raised` works without Tailwind's JIT.
       * Duplication is a bug class this project hunts, so
       * `lib/ui-guard/spatial-primitives.test.ts` asserts the two agree and
       * fails the build if they drift.
       *
       * These are not themed. A shadow mixed from a near-black ink is already
       * invisible against a dark canvas, so a dark theme loses the elevation
       * cue and takes it back from the border, which is the normal trade. The
       * alternative is a second copy of every stack that no guard reads.
       */
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
      /**
       * `sans` is the stylesheet's stack, not a second copy of it. Naming
       * `var(--font-sans)` keeps one source for the font, and the stack leads
       * with `Inter` so a machine that has it uses it, then falls through the
       * platform UI font. No webfont is fetched: `next/font` would download at
       * build time and the build has to work offline.
       */
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
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
      /**
       * The contract wants rectangular controls with a modest radius, and the
       * nine `lg:rounded-[28px]` page frames all repeat the same number.
       * `shell` gives that one a name so the arbitrary value can go.
       */
      borderRadius: {
        chip: "2px",
        input: "4px",
        card: "6px",
        shell: "28px",
      },
      /* 120ms hover and focus, 200ms state, 320ms scene. Nothing else. */
      transitionDuration: {
        120: "120ms",
        200: "200ms",
        320: "320ms",
      },
      /* The stylesheet's curve, so `ease-soft` and `--ease-out-soft` agree. */
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      /* `p-13` and `p-17` exist so `p-[13px]` and `p-[17px]` stop appearing. */
      spacing: {
        13: "13px",
        17: "17px",
      },
      zIndex: {
        sticky: "10",
        dropdown: "20",
        popup: "30",
        sheet: "40",
        skip: "50",
      },
    },
  },
  plugins: [],
};

export default config;
