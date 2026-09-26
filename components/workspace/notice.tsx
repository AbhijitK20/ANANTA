import type { ReactNode } from "react";
import { Info, NotePencil } from "@phosphor-icons/react/dist/ssr";

/**
 * The notice, as a designed component rather than a shouted banner.
 *
 * Three of these pages carry a sentence a visitor has to read before pressing
 * anything: `/provider` and `/admin/operations` have no authentication, and the
 * three legal pages are drafts. Those facts are not warnings, they are scope
 * notes, and the previous treatment dressed them as warnings. A screen that
 * cries wolf on every load teaches a reader to skip the one panel that matters,
 * which is the opposite of what an honesty note is for.
 *
 * So: no amber, no shield glyph, no exclamation. Blue for a fact about the
 * product, a quiet grey rule for a housekeeping note. The text still says the
 * whole thing, because a calm notice that is vague is just decoration.
 */
export function Notice({
  title,
  children,
  tone = "info",
  className = "",
}: {
  title: string;
  children: ReactNode;
  /** `info` for a fact about how the product behaves, `quiet` for housekeeping. */
  tone?: "info" | "quiet";
  className?: string;
}) {
  const Icon = tone === "info" ? Info : NotePencil;
  // A 4px left rule on a hairline box, which is the accent treatment
  // `components/ananta/why-not-that.tsx` already uses. One device, one shape.
  const rule = tone === "info" ? "border-l-4 border-l-blue" : "border-l-4 border-l-muted";
  const iconTone = tone === "info" ? "text-blue" : "text-muted";

  return (
    <aside className={`border border-line ${rule} bg-canvas p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={`mt-0.5 shrink-0 ${iconTone}`} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{title}</p>
          <div className="mt-1 text-sm leading-6 text-muted">{children}</div>
        </div>
      </div>
    </aside>
  );
}
