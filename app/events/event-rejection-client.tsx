"use client";

import { UiStatePanel } from "@/components/ananta/learning/ui-state";

/**
 * The one interactive piece of the event states, split out so
 * `event-rejection.ts` can stay a server-safe module. The events index is a
 * client component and this is a client component, so the boundary is in the
 * right place and the pure functions above stay callable from the server-rendered
 * event detail route.
 */

/** `nothing-retrieved`, naming the one control that widens the set. */
export function NothingReachableState({ onWiden }: { onWiden: () => void }) {
  return (
    <UiStatePanel state="nothing-retrieved">
      <p className="mt-3 text-sm leading-6 text-muted">
        Move the reference time later, or clear the search box, to widen the set. Every event on this page is
        checked against a travel estimate and a window before it is shown, so an empty list means nothing
        reachable is left, not that nothing exists.
      </p>
      <button
        onClick={onWiden}
        className="mt-3 inline-flex min-h-[44px] items-center border border-blue px-4 py-2 text-sm font-bold text-blue"
      >
        Reset the reference time and the search
      </button>
    </UiStatePanel>
  );
}
