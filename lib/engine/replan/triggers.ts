import type {
  DiscoveryContext,
  ExperienceV2,
  TriggerId,
} from "@/lib/engine/contracts";
import { cloneForMutation } from "./context";

/** Everything a trigger can be told. Defaults live on the spec, one click deep. */
export interface TriggerArgs {
  /** `time_lost`. Minutes gone from the window. */
  minutesLost?: number;
  /** `budget_dropped`. The new hard budget in rupees. */
  budgetInr?: number;
  /** `sold_out`. The record whose slot went. */
  recordId?: string;
  /** `sold_out`. ISO date-time of the sold out slot. */
  soldOutAt?: string;
}

export type TriggerTransform = (ctx: DiscoveryContext, args: TriggerArgs) => DiscoveryContext;

export interface TriggerSpec {
  id: TriggerId;
  /** What the one-click control says. */
  label: string;
  /** What the world did, in the traveller's tense. */
  event: string;
  /** The control that fires it, for session 9 to render. */
  control: "toggle" | "stepper" | "record" | "slider";
  /** Args the one-click uses when the traveller does not choose their own. */
  defaults: TriggerArgs;
  apply: TriggerTransform;
}

const MS_PER_MINUTE = 60_000;

/**
 * Pulls the return time forward by the same amount the window shrank, floored at
 * the context's own `now`. Both instants come from injected ISO strings, never
 * from the machine clock, so the result is byte identical across runs.
 */
const pullInDeadline = (ctx: DiscoveryContext, minutesLost: number): string | null => {
  if (!ctx.deadline) return null;
  const deadlineMs = Date.parse(ctx.deadline);
  if (!Number.isFinite(deadlineMs)) return ctx.deadline;
  const nowMs = Date.parse(ctx.now);
  const floorMs = Number.isFinite(nowMs) ? nowMs : deadlineMs;
  return new Date(Math.max(floorMs, deadlineMs - minutesLost * MS_PER_MINUTE)).toISOString();
};

/** Rain is monotonic. A storm does not become rain because someone said so. */
const rainSeverity = (ctx: DiscoveryContext): DiscoveryContext["weatherSeverity"] =>
  ctx.weatherSeverity === "heavy_rain" || ctx.weatherSeverity === "storm" ? ctx.weatherSeverity : "rain";

const appendNeed = (
  needs: readonly DiscoveryContext["accessNeeds"][number][],
  need: DiscoveryContext["accessNeeds"][number],
): DiscoveryContext["accessNeeds"] =>
  needs.includes(need) ? [...needs] : [...needs, need];

/**
 * The six triggers. Each is a pure `(ctx, args) => ctx` transform, and each
 * returns a context whose `original` is the untouched frozen baseline, because
 * every one of them goes through `cloneForMutation`.
 *
 * None of them edits what the traveller said they wanted. `rain_started` does
 * not add anything to `profile.avoid`: the traveller did not tell us they hate
 * the rain, the sky changed. That distinction is the whole product thesis, so
 * it has its own test.
 */
export const TRIGGERS: Record<TriggerId, TriggerSpec> = {
  rain_started: {
    id: "rain_started",
    label: "It started raining",
    event: "The weather turned",
    control: "toggle",
    defaults: {},
    apply: (ctx) => cloneForMutation(ctx, { raining: true, weatherSeverity: rainSeverity(ctx) }),
  },
  time_lost: {
    id: "time_lost",
    label: "We lost 90 minutes",
    event: "The window shrank",
    control: "stepper",
    defaults: { minutesLost: 90 },
    apply: (ctx, args) => {
      const minutesLost = Math.max(0, Math.round(args.minutesLost ?? 90));
      return cloneForMutation(ctx, {
        availableMinutes: Math.max(0, ctx.availableMinutes - minutesLost),
        deadline: ctx.deadline === null ? null : pullInDeadline(ctx, minutesLost),
      });
    },
  },
  sold_out: {
    id: "sold_out",
    label: "This one's sold out",
    event: "A provider sold the slot",
    control: "record",
    defaults: {},
    // The sold out fact lives on the record, in `availability.soldOutAt`, which
    // is where the frozen contract puts availability. The context half of this
    // trigger is therefore deliberately empty: the world changed, the
    // traveller's intent did not. `markSoldOut` is the other half.
    apply: (ctx) => cloneForMutation(ctx, {}),
  },
  budget_dropped: {
    id: "budget_dropped",
    label: "Budget dropped",
    event: "There is less money",
    control: "slider",
    defaults: {},
    apply: (ctx, args) =>
      cloneForMutation(ctx, {
        budgetInr: Math.max(0, Math.round(args.budgetInr ?? Math.floor(ctx.budgetInr / 2))),
      }),
  },
  needs_restroom: {
    id: "needs_restroom",
    label: "Someone needs a restroom",
    event: "A new need appeared",
    control: "toggle",
    defaults: {},
    apply: (ctx) => cloneForMutation(ctx, { accessNeeds: appendNeed(ctx.accessNeeds, "accessible_restroom") }),
  },
  tired: {
    id: "tired",
    label: "They are tired",
    event: "The pace has to soften",
    control: "toggle",
    defaults: {},
    apply: (ctx) =>
      cloneForMutation(ctx, {
        pace: "relaxed",
        idealStops: Math.max(ctx.minStops, ctx.idealStops - 1),
      }),
  },
};

/** The one entry point the UI calls. `args` overrides the spec defaults. */
export function applyNamedTrigger(
  ctx: DiscoveryContext,
  id: TriggerId,
  args: TriggerArgs = {},
): DiscoveryContext {
  const spec = TRIGGERS[id];
  return spec.apply(ctx, { ...spec.defaults, ...args });
}

/**
 * The other half of `sold_out`: a copy of the record set with the named
 * record's slot marked sold. Copies the array and the touched record, touches
 * nothing else, and never mutates the caller's dataset.
 */
export function markSoldOut(
  records: readonly ExperienceV2[],
  recordId: string,
  soldOutAt: string,
): ExperienceV2[] {
  return records.map((record) =>
    record.id === recordId
      ? { ...record, availability: { ...record.availability, soldOutAt } }
      : record,
  );
}
