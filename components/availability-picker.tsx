"use client";

import { useMemo, useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { CONFIDENCE_TONE, typeScale } from "@/components/ananta/tokens";

type DayOption = { key: string; label: string; tone: "green" | "amber" };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Deterministic demo availability: the same place on the same weekday always
 * yields the same pattern, so the demo is stable without a live feed.
 *
 * Three things this panel must keep doing, all of them required by
 * `docs/05-design/DESIGN-CONTRACT.md` and `docs/05-design/ACCESSIBILITY.md`:
 *
 *   - It says "Demo data" and "not a live feed". Both stay. There are no
 *     bookings in this product, and MASTERPLAN.md section 9 is explicit that the
 *     provider side is requests, not transactions. A "confirm with the venue"
 *     affordance must never imply a booking flow exists.
 *   - Status is never colour alone. The dot is decorative, the sentence beside it
 *     is the state, and the pair is one live region read as a unit. Previously
 *     the green branch used an unhidden `Check` icon, so a screen reader heard
 *     "check" and nothing about availability; both icons are now `aria-hidden`
 *     and the sentence carries it.
 *   - No em dash in product copy. `DESIGN-CONTRACT.md:28` bans them, so the
 *     status sentences use full stops.
 */
function availabilityFor(placeName: string, dayOffset: number): DayOption["tone"] {
  let hash = 0;
  const input = `${placeName}-${dayOffset}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 5 === 0 ? "amber" : "green";
}

/** The sentence is the state. The icon only repeats it for sighted readers. */
const STATUS_SENTENCE: Record<DayOption["tone"], string> = {
  green: "Slots are typically available. Confirm with the venue before you travel.",
  amber: "Slots are limited. Call ahead to confirm before you travel.",
};

export function AvailabilityPicker({ placeName }: { placeName: string }) {
  const [selected, setSelected] = useState(0);

  const days = useMemo<DayOption[]>(() => {
    return [0, 1, 2, 3, 4].map((offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const label =
        offset === 0
          ? "Today"
          : offset === 1
            ? "Tomorrow"
            : `${DAY_NAMES[date.getDay()]} ${date.getDate()}`;
      return { key: `${offset}`, label, tone: availabilityFor(placeName, offset) };
    });
  }, [placeName]);

  const active = days[selected] ?? days[0];
  const toneClass = active.tone === "green" ? "text-green" : "text-amber";
  // The unverified tier is the right shape here: this pattern is ours, and we
  // have no provider feed behind it.
  const chipClass = active.tone === "green" ? CONFIDENCE_TONE.community : CONFIDENCE_TONE.unverified;

  return (
    <div className="mt-9 border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Availability</p>
        <span className={`${typeScale.micro} border border-dashed border-muted px-1.5 py-0.5 font-bold uppercase tracking-[0.1em] text-muted`}>
          Demo data
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {days.map((day, index) => (
          <button
            key={day.key}
            type="button"
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
            className={`min-h-[44px] border px-2 py-3 text-xs font-bold transition-colors ${
              index === selected ? "border-blue bg-blue text-white" : "border-line bg-white text-ink hover:border-blue"
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>

      {/*
        One live region, one sentence, one state. The dot is `aria-hidden` on
        purpose: it is decoration that repeats what the sentence already says, so
        a screen reader hears "Slots are typically available" rather than
        "check, slots are typically available".
      */}
      <p className="mt-3 flex items-center gap-1.5" role="status" aria-live="polite">
        <span className={`inline-flex shrink-0 items-center ${toneClass}`}>
          {active.tone === "green" ? (
            <Check size={15} weight="bold" aria-hidden="true" />
          ) : (
            <span aria-hidden="true">•</span>
          )}
        </span>
        <span className={`text-xs font-semibold ${toneClass}`}>{STATUS_SENTENCE[active.tone]}</span>
        <span className={`sr-only ${chipClass}`}>{active.tone === "green" ? "Community" : "Unverified"}</span>
      </p>

      <p className="mt-1 text-[10px] leading-4 text-muted">
        Demo availability pattern, not a live feed. Hours and prices come from the structured record, and
        both are labelled with their provenance on the record itself.
      </p>
      <p className="mt-1 text-[10px] leading-4 text-muted">
        There is no booking here. If you call ahead and the slot is gone, the record is still right: it
        never claimed the slot was held for you.
      </p>
    </div>
  );
}
