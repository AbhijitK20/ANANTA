"use client";

import { typeScale } from "@/components/ananta/tokens";
import { UiStatePanel } from "@/components/ananta/learning/ui-state";
import { DATASET_SIZE } from "@/components/ananta/records";
import type { PipelineRun } from "@/components/ananta/pipeline";

/**
 * Stage visibility, which is the whole demo of the pipeline.
 *
 * The old page printed "Solving." and then a single sentence that mixed three
 * different numbers together. This separates them, and every number comes from
 * the run the engine returned. Nothing here is a literal: the dataset size is
 * imported, and the rest is read off the run.
 *
 * The stage line is a real `aria-live="polite"` region, so a screen reader
 * hears the gate narrowing the set rather than hearing nothing.
 */
export function PipelineStrip({ run }: { run: PipelineRun | null }) {
  if (!run) {
    // The solving state shows the stage, not a spinner. The engine is
    // synchronous so this is brief, but when it shows it says what is happening
    // rather than that something is.
    return (
      <div aria-live="polite">
        <UiStatePanel state="solving">
          <ol className="mt-2 space-y-1 text-sm leading-6">
            <li>1. Retrieving from the committed snapshot</li>
            <li>2. Gating against your constraints</li>
            <li>3. Scoring and ranking what survived</li>
          </ol>
        </UiStatePanel>
      </div>
    );
  }

  const retrieved = run.retrievalCount;
  const considered = run.consideredCount;
  const passed = run.gated.passed.length;
  const refused = considered - passed;

  return (
    <div aria-live="polite" className={`${typeScale.meta} leading-5 text-muted`}>
      {/* The cheapest credibility in the product: retrieval is a real funnel and
          the reader can watch it narrow. */}
      <p className="font-semibold text-ink">
        {formatCount(retrieved)} of {formatCount(considered)} considered
      </p>
      <p className="mt-1">
        {formatCount(passed)} passed the gate, {formatCount(refused)} were refused with a reason.
      </p>
      <p className="mt-1">
        {formatCount(DATASET_SIZE)} records in the catalogue, read from the committed snapshot. Live routing is
        separate and is labelled where it appears.
      </p>
    </div>
  );
}

/** Grouping so a four digit count does not read as a wall of digits. */
function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}
