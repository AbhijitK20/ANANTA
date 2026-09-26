import type { ReactNode } from "react";
import { ArrowLeft, ListBullets } from "@phosphor-icons/react/dist/ssr";
import { Notice } from "@/components/workspace/notice";

/**
 * The long-form document shell, shared by `/privacy`, `/terms` and `/contact`.
 *
 * These three pages are the only place in the product where the reader is
 * expected to read four hundred words rather than scan a card, so they get a
 * real typographic hierarchy: one measure, one scale, one vertical rhythm. The
 * previous versions each hand-rolled that, in three slightly different sizes, so
 * the same `<h2>` sat at three different heights depending on which legal page
 * you opened.
 *
 * The measure is 68 characters, which is the width at which this body size stays
 * readable, and it is a max-width on the article rather than a column count,
 * because a paragraph of legal text is not a grid.
 */
export function LegalDocument({
  kicker,
  title,
  lead,
  children,
  aside,
  closing,
}: {
  kicker: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  /** A short honest caveat, set apart from the body. Never optional in practice. */
  aside?: ReactNode;
  /** The last word on the page: when it was last checked against the code. */
  closing?: ReactNode;
}) {
  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <article className="mx-auto max-w-[760px] bg-white px-6 py-12 sm:px-10 lg:my-8 lg:rounded-2xl lg:px-16 lg:py-16 lg:shadow-card">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-muted transition-colors duration-120 hover:text-blue"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Ananta
        </a>

        <header className="mt-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">{kicker}</p>
          <h1 className="mt-3 text-display tracking-[-0.04em] text-ink">{title}</h1>
          {lead ? <p className="mt-5 text-lead text-muted">{lead}</p> : null}
        </header>

        {aside ? <div className="mt-7">{aside}</div> : null}

        {children}

        {closing ? (
          <p className="mt-12 border-t border-line pt-6 text-xs leading-5 text-muted">{closing}</p>
        ) : null}

        <a
          href="/"
          className="mt-10 inline-flex min-h-[44px] items-center text-sm font-bold text-blue"
        >
          Return to Ananta
        </a>
      </article>
    </main>
  );
}

/**
 * A numbered section. The number is real content, not decoration: a privacy page
 * that says "see section 4" is a page with an addressable structure, and the
 * reader can see the count of sections before committing to any of them.
 */
export function LegalSection({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby={`section-${index}`}>
      <div className="flex items-baseline gap-3">
        <span
          className="text-xs font-bold tabular-nums text-blue"
          aria-hidden="true"
        >
          {String(index).padStart(2, "0")}
        </span>
        <h2 id={`section-${index}`} className="text-title tracking-[-0.03em] text-ink">
          {title}
        </h2>
      </div>
      <div className="mt-4 grid gap-4 text-body leading-7 text-muted">{children}</div>
    </section>
  );
}

/**
 * A jump list, because a page with nine sections and no contents makes the
 * reader scroll to find the one clause they came for.
 */
export function LegalContents({ items }: { items: { href: string; label: string }[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="On this page" className="mt-10 border border-line bg-canvas p-5">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">
        <ListBullets size={14} aria-hidden="true" /> On this page
      </p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="inline-flex min-h-[32px] items-center text-sm font-semibold text-blue"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The caveat that sits directly under the title.
 *
 * It is a `Notice` with a house title rather than a second notice component,
 * because the only thing that distinguishes it is the two words above the
 * sentence. Two components that render the same box is how a reader ends up with
 * two different greys for the same idea.
 */
export function LegalCaveat({ children }: { children: ReactNode }) {
  return (
    <Notice title="Read this first">
      <p>{children}</p>
    </Notice>
  );
}
