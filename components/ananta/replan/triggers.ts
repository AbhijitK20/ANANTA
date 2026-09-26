import type { TriggerId } from "@/lib/engine";
import { TRIGGERS, type TriggerArgs } from "@/components/ananta/replan/engine";

/**
 * The six one-click controls.
 *
 * The list is derived from the engine's own `TRIGGERS` record, so a trigger
 * cannot exist in the engine and be missing from the panel, and a label cannot
 * drift between the two. What this file adds is the one thing the engine
 * deliberately does not carry: what the control is about to simulate. A button
 * labelled "It started raining" that silently rewrites the traveller's context
 * is a trap, and the masterplan frames this whole panel as a demo, so every
 * control says so before it is pressed.
 *
 * `control` comes straight from the engine and says which affordance fits:
 * a toggle, a stepper, a record picker, or a slider.
 */

export type TriggerControl = {
  id: TriggerId;
  /** The button text. Verbatim from the engine so the two cannot disagree. */
  label: string;
  /** What the world did, in the traveller's tense. Verbatim from the engine. */
  event: string;
  control: "toggle" | "stepper" | "record" | "slider";
  /** Exactly what pressing this will change. Named before it is pressed. */
  simulates: string;
  /** The args a single press uses, from the engine's own defaults. */
  args: TriggerArgs;
  /** `record` controls need a target the traveller picks, not a default. */
  needsTarget: boolean;
};

const SIMULATES: Record<TriggerId, string> = {
  rain_started:
    "Sets the weather to rain on the current context and re-solves. It does not add anything to what you avoid: the weather changed, you did not decide you hate rain.",
  time_lost:
    "Takes 90 minutes off the remaining window, pulls your return time in by the same 90 if you set one, and re-solves into what is left.",
  sold_out:
    "Marks the slot you pick as sold out on the record itself, then re-solves the rest of the plan around the gap.",
  budget_dropped:
    "Halves the hard budget and re-solves. Stops priced above the new limit are pruned, and the reason for each one is shown.",
  needs_restroom:
    "Adds an accessible restroom to your access needs. Because no record in the catalogue carries that fact, the gate will report it as unverified rather than refuse on it.",
  tired:
    "Softens the pace and asks for one stop fewer, then re-solves. Your stated preferences are not touched.",
};

export const TRIGGER_ORDER: readonly TriggerId[] = [
  "rain_started",
  "time_lost",
  "sold_out",
  "budget_dropped",
  "needs_restroom",
  "tired",
];

export const TRIGGER_CONTROLS: readonly TriggerControl[] = TRIGGER_ORDER.map((id) => {
  const spec = TRIGGERS[id];
  return {
    id,
    label: spec.label,
    event: spec.event,
    control: spec.control,
    simulates: SIMULATES[id],
    args: { ...spec.defaults },
    needsTarget: spec.control === "record",
  };
});

export function triggerControl(id: TriggerId): TriggerControl {
  const found = TRIGGER_CONTROLS.find((control) => control.id === id);
  if (!found) throw new Error(`No control for trigger "${id}".`);
  return found;
}

/** The `time_lost` and `budget_dropped` values a press will use, for the readouts. */
export const DEMO_MINUTES_LOST = TRIGGERS.time_lost.defaults.minutesLost ?? 90;
