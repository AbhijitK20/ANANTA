"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "@phosphor-icons/react/dist/ssr";
import { readPlan, writePlan } from "@/lib/plan";
import { depth, motion } from "@/components/ananta/tokens";

/**
 * The one add-to-plan implementation, used on the detail page and on Explore.
 *
 * The Explore page used to have its own add-only button whose label flipped to
 * "Added to plan" and then rewrote the same array on every click, so a traveller
 * who removed a place on the detail page came back to Explore and saw "Add to
 * plan" again. Both call sites go through this toggle and both listen to the same
 * `ananta-plan-change` event.
 *
 * **Depth here reflects state and only state.** Not in the plan is
 * `depth-flush`, on the surface, because it is an offer rather than a fact. In the
 * plan is `depth-raised`, standing proud, because it is now part of something.
 *
 * There is deliberately **no hover depth and no `.lift`**, and the reason is the
 * whole grammar: `.lift:hover` sets its own `transform: translateZ(26px)`, which
 * overrides whatever depth the resting state had. Applying it here would send a
 * `depth-flush` control to 26px the moment a pointer arrived and drag it back on
 * leave, so after one hover the control's depth would mean nothing and every
 * other depth on the page would be unreadable by comparison. Depth that changes
 * on hover is not a channel, it is a twitch. Hover is left to the focus ring and
 * the colour change, both of which say "you can act here" without claiming to
 * say anything about state.
 */
export function AddToPlanButton({
  experienceId,
  experienceName,
  onToggle,
  forced,
  block = false,
}: {
  experienceId: string;
  /** Used in the accessible name, so the control is distinguishable in a list. */
  experienceName?: string;
  /** Optional external toggle, so a parent can keep its own array in step. */
  onToggle?: (id: string) => void;
  /** Optional externally-known state, for a parent that already tracks the plan. */
  forced?: boolean;
  /** Renders full width inside a card instead of inline. */
  block?: boolean;
}) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const sync = () => setAdded(readPlan().includes(experienceId));
    sync();
    window.addEventListener("ananta-plan-change", sync);
    return () => window.removeEventListener("ananta-plan-change", sync);
  }, [experienceId]);

  const on = forced ?? added;

  const click = () => {
    const ids = readPlan();
    writePlan(on ? ids.filter((id) => id !== experienceId) : [...ids, experienceId]);
    setAdded(!on);
    onToggle?.(experienceId);
  };

  const shape = block
    ? "mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold"
    : "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold";

  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={on}
      className={`${on ? depth.raised : depth.flush} ${motion.state} ${shape} ${
        on ? "border border-green bg-greenSoft text-green" : "bg-blue text-white hover:bg-[#1249ad]"
      }`}
    >
      <span className="sr-only">
        {experienceName ? `Add ${experienceName} to your plan.` : "Add to your plan."}{" "}
      </span>
      <span aria-hidden="true" className="flex items-center gap-2">
        {on ? <Check size={17} weight="bold" /> : <Plus size={17} weight="bold" />}
        {on ? "In your plan. Tap to remove" : "Add to plan"}
      </span>
    </button>
  );
}
