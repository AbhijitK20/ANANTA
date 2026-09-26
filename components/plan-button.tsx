"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "@phosphor-icons/react/dist/ssr";
import { readPlan, writePlan } from "@/lib/plan";

/**
 * The one add-to-plan implementation, used on the detail page and on Explore.
 *
 * The Explore page used to have its own add-only button whose label flipped to
 * "Added to plan" and then rewrote the same array on every click, so a traveller
 * who removed a place on the detail page came back to Explore and saw "Add to
 * plan" again. Both call sites now go through this toggle and both listen to
 * the same `ananta-plan-change` event.
 */
export function AddToPlanButton({
  experienceId,
  onToggle,
  forced,
  block = false,
}: {
  experienceId: string;
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
      className={`${shape} ${on ? "border border-green bg-greenSoft text-green" : "bg-blue text-white hover:bg-[#1249ad]"}`}
    >
      {on ? <Check size={17} weight="bold" /> : <Plus size={17} weight="bold" />}
      {on ? "In your plan. Tap to remove" : "Add to plan"}
    </button>
  );
}
