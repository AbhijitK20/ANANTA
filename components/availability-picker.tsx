"use client";

import { useMemo, useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";

type DayOption = { key: string; label: string; tone: "green" | "amber" };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Deterministic demo availability: the same place on the same weekday always
 * yields the same pattern, so the demo is stable without a live feed. The
 * panel states plainly that this is demo data, not a live booking claim.
 */
function availabilityFor(placeName: string, dayOffset: number): DayOption["tone"] {
  let hash = 0;
  const input = `${placeName}-${dayOffset}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 5 === 0 ? "amber" : "green";
}

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

  return (
    <div className="mt-9 border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Availability</p>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Demo data</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {days.map((day, index) => (
          <button
            key={day.key}
            type="button"
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
            className={`border px-2 py-3 text-xs font-bold transition-colors ${
              index === selected ? "border-blue bg-blue text-white" : "border-line bg-white text-ink hover:border-blue"
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
        {active.tone === "green" ? (
          <Check size={15} weight="bold" className="text-green" />
        ) : (
          <span aria-hidden="true" className="text-amber">•</span>
        )}
        <span className={active.tone === "green" ? "text-green" : "text-amber"}>
          {active.tone === "green"
            ? "Slots typically available — confirm with the venue"
            : "Limited slots — call ahead to confirm"}
        </span>
      </p>
      <p className="mt-1 text-[10px] leading-4 text-muted">
        Demo availability pattern, not a live feed. Hours and prices come from the structured record.
      </p>
    </div>
  );
}
