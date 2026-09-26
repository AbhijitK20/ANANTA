"use client";

import type { ReactNode } from "react";
import { Check, X } from "@phosphor-icons/react/dist/ssr";

/**
 * The three control shapes the explore screen needs, and no more.
 *
 * `docs/05-design/DESIGN-CONTRACT.md:16` bans the pill as the default control
 * style and `:35` asks for a modest radius, so a filter chip is `rounded`, not
 * `rounded-full`. It is a small rectangular target, which is also what a 44px
 * touch minimum wants: the padding carries the height, not the radius.
 *
 * Every state is a second channel. A selected chip is filled blue *and* carries a
 * check glyph, a toggle is a filled track *and* `aria-checked`, and a removal
 * chip is labelled by text *and* by the cross it contains. Nothing here is
 * colour only.
 *
 * No transition on the toggle thumb: the position is a class swap, so it costs
 * nothing on the compositor and the reduced-motion block has nothing to
 * neutralise. That is the whole reason it is a swap and not a slide.
 */

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-[36px] items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold ${
        active ? "border-blue bg-blue text-white" : "border-line bg-white text-ink hover:border-blue"
      }`}
    >
      {active && <Check size={12} weight="bold" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded border border-line bg-white px-3 py-2 text-left hover:border-blue"
    >
      <span className="min-w-0">
        <span className="block text-xs font-bold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-4 text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full border ${
          checked ? "border-blue bg-blue" : "border-line bg-canvas"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${
            checked ? "left-[1.5rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function FacetGroup({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</legend>
      {note && <p className="mt-1.5 text-[11px] leading-4 text-muted">{note}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

/**
 * An applied constraint, with the control that undoes it.
 *
 * The old summary printed every active constraint as one sentence joined with
 * dots and offered a single "clear everything", so a traveller who wanted to widen
 * the radius had to throw away the category, the budget and the time of day with
 * it. One chip, one undo.
 */
export function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <li className="flex items-center gap-1 rounded border border-blue bg-blueSoft/70 py-1 pl-2.5 pr-1 text-xs font-bold text-blue">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove the ${label} filter`}
        className="flex h-6 w-6 items-center justify-center rounded text-blue hover:bg-white"
      >
        <X size={13} weight="bold" />
      </button>
    </li>
  );
}
