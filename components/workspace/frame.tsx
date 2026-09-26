import type { ElementType, ReactNode } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

/**
 * The page shell and the four blocks every dashboard on this product is built
 * from. They live here rather than in each page because five pages were about to
 * grow their own copy of the same four things, and a chip that means "this is
 * unverified" has to look the same on `/saved` as it does in the operations
 * queue.
 *
 * Nothing here invents a token. Every colour, radius, shadow and size comes from
 * `tailwind.config.ts` and `app/globals.css`, and the `.card` frame is the class
 * those two files already ratified. Adding a new surface tone here would be a
 * second palette, which is the exact defect `DESIGN-CONTRACT.md` guards against.
 *
 * One trap worth writing down, because it costs a depth encoding silently:
 * `.card` is a hand-written rule that sits *after* `@tailwind utilities` in
 * `app/globals.css`, so it is unlayered and it beats every utility. Put `.card`
 * and a `depth-*` class on the same element and the card's `box-shadow` wins over
 * the depth step's, so a `depth-recessed` card renders with a raised shadow and
 * no inset. The cards here carry no depth. The ones that do, such as the saved
 * shortlist, spell the frame out with `rounded-card border border-line` instead.
 */

/** The two widths in use. A personal dashboard is narrower than an operator queue. */
const WIDTH = {
  dashboard: "max-w-[1180px]",
  workspace: "max-w-[1320px]",
} as const;

export function DashboardFrame({
  width = "dashboard",
  children,
}: {
  width?: keyof typeof WIDTH;
  children: ReactNode;
}) {
  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div
        className={`mx-auto min-h-screen bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card ${WIDTH[width]}`}
      >
        {children}
      </div>
    </main>
  );
}

/** The thin bar at the top of every page: one destination back, one forward. */
export function SheetBar({ children }: { children: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4 sm:px-8">
      {children}
    </header>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 text-sm font-bold text-muted transition-colors duration-120 hover:text-blue"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </a>
  );
}

/**
 * One title block per section. Always an `h2`: `DashboardFrame` leaves the
 * document `h1` to `SheetBar`, so every page has exactly one and every section
 * below it is at the same level, which is what keeps the two dashboard columns
 * in a two column layout from interleaving their heading levels.
 */
export function SectionHead({
  id,
  eyebrow,
  title,
  description,
}: {
  /** Set it and point a wrapping `<section aria-labelledby>` at it. */
  id?: string;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">{eyebrow}</p>
        ) : null}
        <h2 id={id} className="mt-1.5 text-title text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A count with the label that says what the count is of.
 *
 * The number is the loud part and the label is the honest part, so the label is
 * never replaced by an icon. `DESIGN-CONTRACT.md` lines 17 to 19 ban fake
 * metrics, which is a different rule, but the spirit is the same: a number on
 * this product always arrives with the words that make it mean something.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  note,
  href,
}: {
  /** Any icon component. `ElementType` because the phosphor `IconProps` type is
   *  wider than a hand-written prop shape and a narrower one fails to compile. */
  icon: ElementType;
  label: string;
  value: ReactNode;
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{label}</span>
        <Icon size={18} className="shrink-0 text-blue" aria-hidden />
      </div>
      <p className="mt-3 text-title text-ink">{value}</p>
      {note ? <p className="mt-1.5 text-xs leading-5 text-muted">{note}</p> : null}
    </>
  );

  // A border shift, not a lift. Depth is the ratified channel for epistemic
  // status, and spending it on a hover is how a reader learns to ignore it.
  const shell = `card block p-4 ${href ? "transition-colors duration-120 hover:border-blue" : ""}`;
  return href ? (
    <a href={href} className={shell}>
      {body}
    </a>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** The grid the stat tiles sit in. One breakpoint, because four across 390px is unreadable. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
