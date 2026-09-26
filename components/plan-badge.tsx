"use client";

import { useEffect, useState } from "react";
import { readPlan } from "@/lib/plan";

/**
 * Live count of drafted places, slotted into `BottomNav` next to Trips.
 *
 * The badge is a bare number in a coloured pill, which is a state told by colour
 * and shape alone: a screen reader announced nothing useful, and a traveller who
 * cannot distinguish the pill from the surrounding chrome has no idea what the
 * number counts. So the digit keeps its position and its size, and an `sr-only`
 * sentence carries the count with the word "plan" in it, which is what makes it a
 * count *of a plan* rather than a count.
 *
 * **This is the one control with no depth at all, and that is deliberate.** The
 * bottom navigation is `position: fixed`. A `translateZ` on a fixed element
 * promotes it and detaches it from the viewport edge, and `preserve-3d` on any
 * ancestor creates a stacking context that fights fixed positioning outright, so
 * the bar can end up scrolling with the page or clipped. The nav is chrome, not
 * content: it is not a record, not a plan step and not a knowledge state, so it
 * has nothing to encode. Depth on it would be decoration, and decoration in a
 * channel that means something is how a channel stops meaning something.
 *
 * Nothing is rendered at zero. A "0" badge on every visit to a fresh account is
 * noise, and the navigation item it sits next to is already there.
 */
export function PlanBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(readPlan().length);
    sync();
    window.addEventListener("ananta-plan-change", sync);
    return () => window.removeEventListener("ananta-plan-change", sync);
  }, []);

  if (count === 0) return null;

  return (
    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue px-1.5 text-[10px] font-bold leading-[18px] text-white">
      <span className="sr-only">
        {count} {count === 1 ? "place" : "places"} in your plan
      </span>
      <span aria-hidden="true">{count}</span>
    </span>
  );
}
