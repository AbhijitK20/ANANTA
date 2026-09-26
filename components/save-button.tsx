"use client";

import { useEffect, useState } from "react";
import { BookmarkSimple } from "@phosphor-icons/react/dist/ssr";
import { readSaved, writeSaved } from "@/lib/saved";
import { depth, motion } from "@/components/ananta/tokens";

/**
 * Save and unsave, as one toggle whose depth is its state.
 *
 * **Unpressed is `depth-flush`, pressed is `depth-raised`, and there is no hover
 * depth.** The reasoning is in `plan-button.tsx` and it is the same here: a
 * control that changes depth when the pointer arrives has a depth that means
 * nothing, and the grammar collapses for the rest of the page. Depth says what
 * state you are in. Nothing else may claim the channel.
 *
 * The old version swapped its `aria-label` between "Save experience" and "Remove
 * from saved", which is a state change expressed as a name change. A control that
 * renames itself when pressed is announced as a different control. So the name is
 * stable, `aria-pressed` carries the state, and the icon is the only thing that
 * moves, with a written state for anyone who cannot see it.
 *
 * A save is a save. `lib/saved.ts` feeds the provider demand counts, so this
 * writes exactly one id on and exactly one id off and never touches anything
 * else. Inflating that count would be the easiest lie in the product to ship and
 * the hardest to notice.
 */
export function SaveButton({ experienceId, experienceName }: { experienceId: string; experienceName?: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(readSaved().includes(experienceId));
    sync();
    window.addEventListener("ananta-saved-change", sync);
    return () => window.removeEventListener("ananta-saved-change", sync);
  }, [experienceId]);

  const click = () => {
    const ids = readSaved();
    writeSaved(saved ? ids.filter((id) => id !== experienceId) : [...ids, experienceId]);
    setSaved(!saved);
  };

  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={saved}
      className={`${saved ? depth.raised : depth.flush} ${motion.state} rounded-lg border p-2.5 ${
        saved ? "border-blue bg-blueSoft text-blue" : "border-line text-ink"
      }`}
    >
      <span className="sr-only">
        {experienceName ? `Save ${experienceName} to your list.` : "Save to your list."}{" "}
        {saved ? "Saved." : "Not saved."}
      </span>
      <span aria-hidden="true" className="flex items-center">
        <BookmarkSimple size={20} weight={saved ? "fill" : "regular"} />
      </span>
    </button>
  );
}
