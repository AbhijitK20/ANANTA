"use client";

import { MagnifyingGlass, TrendDown, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { StateNote, StatusLabel } from "@/components/ui";
import { TONE_TEXT, typeScale } from "@/components/ananta/tokens";
import type { UnmetDemand } from "@/lib/engine";

/**
 * The unmet-demand feed. The economic argument of the whole product, so it is
 * the first block a provider sees rather than a tab at the bottom.
 *
 * Every sentence here comes from the engine. The dominant constraint is the
 * `Rejection.sentence` that `lib/engine/feasibility` built, the mix is the real
 * distribution, and the count is a real count. Nothing on this surface is
 * written here, and no number is rounded up to look better. A demand feed that
 * inflates itself is worse than no demand feed, because the whole point of it
 * is that a provider can act on it.
 */

/** The code that says the traveller had no room, as opposed to no money or no fit. */
const CHEAPEST_FIRST: ReadonlySet<string> = new Set([
  "duration_exceeds_budget",
  "travel_time_exceeds_budget",
  "too_far",
  "over_budget_per_person",
]);

/** A code only the traveller can change, so no venue can act on it. */
const TRAVELLER_SIDE: ReadonlySet<string> = new Set([
  "excluded_by_traveller",
  "already_planned",
  "duplicate",
]);

/** Human wording for the unit, so a shortfall is never a bare number. */
const UNIT_LABEL: Record<string, { one: string; many: string }> = {
  minutes: { one: "minute", many: "minutes" },
  inr: { one: "rupee", many: "rupees" },
  seats: { one: "seat", many: "seats" },
  km: { one: "km", many: "km" },
  metres: { one: "metre", many: "metres" },
  days: { one: "day", many: "days" },
  none: { one: "", many: "" },
};

/** "42 minutes" with a real singular and plural, and no trailing zero. */
export function shortfallText(value: number, unit: string): string {
  const label = UNIT_LABEL[unit] ?? UNIT_LABEL.none;
  if (!label || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${rounded === 1 ? label.one : label.many}`;
}

/**
 * What would have to change, in the traveller's terms, for this demand to be
 * servable. Built from the code and the median shortfall the engine already
 * computed, never from a copy table that could drift from the code table.
 */
function unlockText(demand: UnmetDemand): string {
  const { code } = demand.dominantRejection;
  const gap =
    demand.medianShortfall === null
      ? ""
      : ` by a median ${shortfallText(demand.medianShortfall, demand.unit)}`;

  if (CHEAPEST_FIRST.has(code)) {
    // `medianShortfall` is null when the engine declined to measure, and
    // `shortfallText(0, unit)` returns a truthy "0 minutes", so the old
    // `?? 0` told a provider the traveller was zero minutes short when the truth
    // is that nobody measured. Naming the gap is the whole value of this feed.
    const size =
      demand.medianShortfall === null
        ? "more window"
        : `${shortfallText(demand.medianShortfall, demand.unit)} of window`;
    return `Give the traveller ${size}, or find a stop that fits inside the one they have.`;
  }
  if (code === "over_budget" || code === "over_budget_per_person") {
    return `Lower the price${gap}, or offer a cheaper slot a traveller in this group can use.`;
  }
  if (code === "capacity_exceeded") {
    return `Publish more capacity${gap}, or accept the group in a different slot.`;
  }
  if (code === "closed_now" || code === "closed_during_window" || code === "hours_unverified") {
    return "Publish your opening hours. Until they are on record the gate will not claim you are open, and no traveller can be sent to you.";
  }
  if (code === "sold_out") {
    return "Release the slot, or publish a second one for the same slot.";
  }
  if (code === "lead_time_too_short") {
    return "Shorten the notice you need, or publish a walk-in option.";
  }
  if (TRAVELLER_SIDE.has(code)) {
    return "Nothing a venue can do. The traveller excluded this one themselves.";
  }
  if (code === "weather_unsafe" || code === "seasonal_mismatch") {
    return "Publish a wet-weather or off-season option, if you have one. Otherwise this demand is seasonal by nature.";
  }
  if (code === "no_route") {
    return "Nothing to change here. The traveller could not reach you inside their window.";
  }
  return "No provider-side field covers this one. It is listed so the shape of demand is not hidden.";
}

export function UnmetDemandFeed({
  demand,
  totalRows,
  onAsk,
  onRunScan,
  scanning,
}: {
  demand: readonly UnmetDemand[];
  /** How many raw refusal rows produced this feed, which is not the same as the row count. */
  totalRows: number;
  onAsk?: (demand: UnmetDemand) => void;
  onRunScan?: () => void;
  scanning?: boolean;
}) {
  /* The empty case is a real state with a real explanation, not a blank div.
     An empty demand feed on a fresh device is the truth and it needs a reason
     and a next action, not an apology. */
  if (totalRows === 0) {
    return (
      <StateNote state="nothing-retrieved">
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          No search has been recorded on this device yet, so there is nothing to show here. That
          is the honest state rather than an empty state we are hiding. The feed fills itself the
          moment a traveller searches and the feasibility gate refuses something, and an operator
          can generate real refusals from the gate right now, on this device.
        </p>
        {onRunScan && (
          <button
            onClick={onRunScan}
            disabled={scanning}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded border border-blue px-4 py-2 text-sm font-bold text-blue disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
          >
            <MagnifyingGlass size={16} aria-hidden="true" />
            {scanning ? "Scanning the gate" : "Scan the gate now"}
          </button>
        )}
      </StateNote>
    );
  }

  /* Rows exist but none group into demand. That is a different state from an
     empty stream and it deserves its own words. */
  if (demand.length === 0) {
    return (
      <StateNote state="abstained">
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          {totalRows} refusal{totalRows === 1 ? " was" : "s were"} recorded, but each one named a
          different area and interest, so none of them collapse into a demand a provider could
          act on. More searches against the same wish will group them here.
        </p>
      </StateNote>
    );
  }

  return (
    <div className="grid gap-3">
      <p className={typeScale.meta + " text-muted"}>
        {demand.length} grouped demand{demand.length === 1 ? "" : "s"} from {totalRows} recorded
        refusal{totalRows === 1 ? "" : "s"}. Every count is what the feasibility gate actually
        refused, on this device.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {demand.map((item) => {
          const actionable = item.actionableFor.length > 0;
          return (
            <article key={item.id} className="card flex flex-col p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusLabel tone={actionable ? "amber" : "blue"}>{item.area}</StatusLabel>
                {item.medianShortfall !== null && (
                  <span className={typeScale.meta + " " + TONE_TEXT.muted}>
                    median {shortfallText(item.medianShortfall, item.unit)} short
                  </span>
                )}
              </div>
              {/* The query is verbatim from the traveller. React escapes it,
                  and this is a search box, so no HTML interpretation applies. */}
              <h3 className="mt-3 text-lg font-bold leading-6 text-ink">
                {item.query || "A general search in this area"}
              </h3>
              <p className={typeScale.meta + " mt-1 " + TONE_TEXT.muted}>
                {item.demandCount} traveller{item.demandCount === 1 ? "" : "s"} wanted this and
                could not get it. First recorded {item.firstSeenAt}, last {item.lastSeenAt}.
              </p>

              <div className="mt-4 border-t border-line pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                  The one thing that blocked it
                </p>
                {/* The sentence is the engine's. Never reworded here. */}
                <p className="mt-1 text-sm font-semibold leading-6 text-ink">
                  {item.dominantRejection.sentence}
                </p>
              </div>

              <div className="mt-3 border-t border-line pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                  What would unlock it
                </p>
                <p className="mt-1 flex items-start gap-2 text-sm leading-6 text-ink">
                  <TrendDown size={15} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                  <span>{unlockText(item)}</span>
                </p>
              </div>

              {/* One cause is not the whole story, so the full mix is here rather
                  than being summarised into a single number. */}
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer select-none text-xs font-bold uppercase tracking-[0.1em] text-muted">
                  The full mix of refusals
                </summary>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {item.rejectionMix.map((entry) => {
                    const share = item.demandCount === 0 ? 0 : Math.round((entry.count / item.demandCount) * 100);
                    return (
                      <li
                        key={entry.code}
                        className="rounded bg-canvas px-2 py-1 text-xs font-semibold text-muted"
                      >
                        {entry.code.replace(/_/g, " ")} x{entry.count} ({share}%)
                      </li>
                    );
                  })}
                </ul>
              </details>

              <div className="mt-auto pt-4">
                {actionable && onAsk ? (
                  <button
                    onClick={() => onAsk(item)}
                    className="inline-flex min-h-[36px] items-center rounded border border-line px-3 py-1.5 text-xs font-bold text-ink transition-colors duration-120 hover:border-blue hover:text-blue"
                  >
                    Open a request about {item.area}
                  </button>
                ) : (
                  <p className="flex items-start gap-2 text-xs leading-5 text-muted">
                    <WarningCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      No provider can act on this one from the catalogue. The blocker is weather,
                      season, distance or the traveller&apos;s own party rather than anything a venue
                      controls.
                    </span>
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
