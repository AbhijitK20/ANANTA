import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { BottomNavItem } from "@/components/bottom-nav";
import { UI_STATE_COPY } from "@/components/ananta/tokens";

/**
 * `BottomNav` is a server component and stays in this file, because the shell is
 * layout and layout does not need the URL. Only the item reads the pathname, so
 * only the item is a client component. It used to be defined here with
 * `aria-current` hardcoded to `index === 0`, which meant every page announced
 * "Home" and highlighted Home.
 */

/**
 * The four primitives this app needs, and deliberately not a component library.
 * The app looks consistent because the copy is disciplined, not because this file
 * is large. `docs/05-design/DESIGN-CONTRACT.md:36` requires one consistent icon
 * library and `@phosphor-icons/react` is the one that is installed.
 *
 * `ButtonLink` used to live here with zero usages. It is deleted. Deletion is the
 * only fix for dead code that nothing catches.
 */

/* ── Button ──────────────────────────────────────────────────────────────── */

/**
 * Rectangular with a modest radius, per `docs/05-design/DESIGN-CONTRACT.md:35`.
 * `rounded-lg` is a 16px radius on a 40px-tall control, which reads as a
 * stadium, and `DESIGN-CONTRACT.md:16` bans pill-shaped buttons as the default
 * style. So this is `rounded`, not `rounded-full`.
 *
 * ponytail: three variants is the whole set. If a fourth appears, the question
 * is whether the thing is a button at all.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded px-4 py-3 text-sm font-bold transition-colors duration-100 ease-out disabled:cursor-not-allowed disabled:opacity-55";

const BUTTON_VARIANT = {
  /** The one primary action per screen. Royal blue fill. */
  primary: "bg-blue text-white hover:bg-[#1348a8]",
  /** A competing action. White with a line border, so it never looks disabled. */
  secondary: "border border-line bg-white text-ink hover:border-blue hover:text-blue",
  /** A tertiary action inside a dense row. Transparent until hovered. */
  ghost: "text-blue hover:bg-blueSoft",
} as const;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: {
  variant?: keyof typeof BUTTON_VARIANT;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/**
 * The class string for a button-shaped control, for the pages that need a
 * `next/link` rather than a `<button>`. This is the landing's primary action:
 * it navigates, so it must be a link, but it must look like the one primary
 * button in the app.
 *
 * Exported instead of a `ButtonLink` component, because `ButtonLink` existed
 * with zero usages for a whole round. A class function can be used by any link;
 * a component can only be forgotten.
 */
export function buttonClass(variant: keyof typeof BUTTON_VARIANT = "primary", className = ""): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`.trim();
}

/* ── Field ───────────────────────────────────────────────────────────────── */

/**
 * Label, control, hint and error, with the `htmlFor` and `aria-describedby`
 * pairing done once. Five screens each had their own copy of this wiring before,
 * and every one of them was slightly wrong in a different way.
 *
 * `id` is required rather than generated, because a generated id in a server
 * component is not stable across renders and `aria-describedby` pointing at a
 * stale id is worse than no description at all.
 *
 * `children` must be exactly one form control. It is cloned with `id` and
 * `aria-describedby` merged in, which is the only way to guarantee the pairing
 * without asking five call sites to remember it.
 * ponytail: if a second child is ever needed, this stops being a Field.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className = "",
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="mt-1.5">{control}</div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs leading-5 text-amber">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Wraps the ratified `.sr-only` at `app/globals.css:168` rather than
 * re-declaring the clip rectangle in a fourth place.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/* ── StateNote ───────────────────────────────────────────────────────────── */

/**
 * The nine `UiState` values, rendered.
 *
 * `UI_STATE_COPY` in `components/ananta/tokens.ts` holds the sentences and this
 * holds the shape, so a state is never an ad-hoc paragraph nine screens wrote
 * nine ways. RULE 3: "We don't know" is a first-class visual state, not an error
 * state, which is why the `muted` tone is a considered grey rather than a wash.
 *
 * `muted` is deliberately not a warning colour. An `amber` state is reserved for
 * the three that really are degraded: routing down, sold out, and broken.
 */
export function StateNote({
  state,
  className = "",
  children,
}: {
  state: keyof typeof UI_STATE_COPY;
  className?: string;
  children?: ReactNode;
}) {
  const copy = UI_STATE_COPY[state];
  const tone =
    copy.tone === "blue"
      ? "border-blue bg-blueSoft"
      : copy.tone === "amber"
        ? "border-amber bg-amberSoft"
        : "border-line bg-canvas";
  const title = copy.tone === "muted" ? "text-ink" : copy.tone === "amber" ? "text-amber" : "text-blue";

  return (
    <div className={`border p-4 ${tone} ${className}`}>
      <p className={`text-sm font-bold ${title}`}>{copy.title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{copy.body}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/* ── Unchanged, and load bearing ─────────────────────────────────────────── */

/**
 * 20 usages. Each of the three tones carries text, never colour alone, which is
 * what `docs/05-design/ACCESSIBILITY.md:8` requires. Do not make it colour only.
 */
export function StatusLabel({ tone = "blue", children }: { tone?: "blue" | "green" | "amber"; children: ReactNode }) {
  const colors = { blue: "bg-blueSoft text-blue", green: "bg-greenSoft text-green", amber: "bg-amberSoft text-amber" };
  return <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${colors[tone]}`}>{children}</span>;
}

export function SectionHeading({ eyebrow, title, href }: { eyebrow: string; title: string; href: string }) {
  return <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">{eyebrow}</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">{title}</h2></div><a href={href} className="flex items-center gap-1 text-sm font-bold text-blue">See all <span aria-hidden="true">&rarr;</span></a></div>;
}

const BOTTOM_NAV = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/trips", label: "Trips", badge: true },
  { href: "/saved", label: "Saved" },
  { href: "/profile", label: "Profile" },
];

/**
 * The mobile navigation, and a desktop bar above `lg` for the pages that never
 * got a header of their own.
 *
 * The spacer above is not decoration. Without it the fixed bar covers the last
 * row of content at 390px, which is the primary demo viewport.
 *
 * `bg-surface` rather than `bg-white`, so the bar follows the theme. It is the
 * only bar in the app that can, because it is the only one whose colour was a
 * token to begin with.
 */
export function BottomNav() {
  return (
    <>
      <div className="h-20 lg:hidden" aria-hidden="true" />
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-dropdown flex border-t border-line bg-surface/95 px-3 py-3 backdrop-blur lg:static lg:mx-5 lg:border-t-0 lg:bg-transparent lg:px-8 lg:py-5"
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-between lg:max-w-none">
          {BOTTOM_NAV.map((item) => (
            <BottomNavItem key={item.href} href={item.href} label={item.label} badge={item.badge} />
          ))}
        </div>
      </nav>
    </>
  );
}
