import type { ReactNode } from "react";
import { UI_STATE_COPY, depth, depthShadow, type UiState } from "@/components/ananta/tokens";

/**
 * The nine knowledge states, rendered deliberately.
 *
 * RULE 3 from the contracts and section 5 of the design doc: a state that
 * renders a blank div is a bug. This is the one place the copy and the shape
 * live, so a screen does not have to invent a state panel per page and so a
 * rejection on /saved and a rejection on /trips look like the same product.
 *
 * The tone is never the only signal. Every state carries a title and a body in
 * text, and the border is dashed for the three states that mean "we do not
 * know", which is the design thesis rather than a warning colour.
 *
 * Depth follows the contract's table: a state that means "we declined to judge"
 * is `depth-recessed` (unknown, so it sits back), a state that is informational
 * is `depth-flush` (our arithmetic laid on the surface), and a state about to do
 * something is `depth-raised` (primary right now). Never floating or foreground,
 * because a state panel is not a sheet and not a modal.
 */

/** The three states that mean ignorance rather than failure. */
const UNCERTAIN: ReadonlySet<UiState> = new Set<UiState>(["abstained", "partially-unknown", "nothing-fits"]);

/** States about an action in progress or just taken, which stand slightly proud. */
const ACTIVE: ReadonlySet<UiState> = new Set<UiState>(["solving", "sold-out", "routing-down", "offline"]);

const TONE_BORDER: Record<"blue" | "muted" | "amber", string> = {
  blue: "border-blue",
  muted: "border-line",
  amber: "border-amber",
};

const TONE_TEXT: Record<"blue" | "muted" | "amber", string> = {
  blue: "text-blue",
  muted: "text-muted",
  amber: "text-amber",
};

const TONE_FILL: Record<"blue" | "muted" | "amber", string> = {
  blue: "bg-blueSoft/40",
  muted: "bg-canvas",
  amber: "bg-amberSoft/40",
};

function depthFor(state: UiState): { step: string; shadow: string } {
  if (ACTIVE.has(state)) return { step: depth.raised, shadow: depthShadow.raised };
  if (UNCERTAIN.has(state)) return { step: depth.recessed, shadow: depthShadow.recessed };
  return { step: depth.flush, shadow: depthShadow.flush };
}

export function UiStatePanel({
  state,
  action,
  children,
}: {
  state: UiState;
  /** The one control that moves the traveller forward. Never a dead end. */
  action?: { href: string; label: string } | null;
  children?: ReactNode;
}) {
  const copy = UI_STATE_COPY[state];
  const { step, shadow } = depthFor(state);
  return (
    <div
      className={`border ${TONE_BORDER[copy.tone]} ${TONE_FILL[copy.tone]} p-6 ${
        UNCERTAIN.has(state) ? "border-dashed" : ""
      } ${step} ${shadow}`}
      role="status"
    >
      <p className={`text-xs font-bold uppercase tracking-[0.12em] ${TONE_TEXT[copy.tone]}`}>{copy.title}</p>
      <p className="mt-2 max-w-[68ch] text-sm leading-6">{copy.body}</p>
      {children}
      {action ? (
        <a
          href={action.href}
          className="mt-4 inline-flex min-h-[44px] items-center border border-blue px-4 py-2 text-sm font-bold text-blue"
        >
          {action.label}
        </a>
      ) : null}
    </div>
  );
}

/** Every state, for a page that has to show a screen-reader reachable index. */
export const ALL_UI_STATES: readonly UiState[] = [
  "solving",
  "nothing-fits",
  "nothing-retrieved",
  "partially-unknown",
  "abstained",
  "routing-down",
  "offline",
  "sold-out",
  "broken",
];
