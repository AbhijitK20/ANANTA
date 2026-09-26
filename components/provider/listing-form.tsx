"use client";

import { FormEvent } from "react";
import { CheckCircle, Plus } from "@phosphor-icons/react/dist/ssr";
import { buttonClass } from "@/components/ui";
import { Notice } from "@/components/workspace/notice";

/**
 * The submission form, which is the only free-text surface in the product.
 *
 * Two things it does that the previous version did not:
 *
 * 1. **A confirmation that survives the reset.** The old form cleared itself and
 *    printed nothing, so a provider who pressed Submit had no idea whether it
 *    worked. The name comes back, and the sentence says what actually happened,
 *    which is that the listing is queued and is not yet in Explore.
 * 2. **Optional fields that say what a blank one means.** Price and duration are
 *    both kept. A blank price is unknown, not free, and an unknown price can
 *    never pass the budget gate, so the field has to say that rather than leave a
 *    provider to guess whether leaving it blank makes the listing cheaper.
 */

const CATEGORIES = [
  "Workshop", "Food", "Culture", "Nature", "Shopping",
  "Nightlife", "Adventure", "Recreation", "Stay", "Family",
] as const;

const INPUT =
  "mt-1.5 block w-full rounded border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted";

export function ListingForm({
  onSubmit,
  submitted,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitted: string | null;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="card p-5 sm:p-6 lg:sticky lg:top-8"
      aria-labelledby="submit-listing-heading"
    >
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blueSoft text-blue">
          <Plus size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue">New listing</p>
          <h2 id="submit-listing-heading" className="mt-1 text-title tracking-[-0.03em] text-ink">
            Submit an experience
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <Field name="name" label="Experience name" placeholder="Weekend pottery workshop" required />
        <Field name="area" label="Area" placeholder="Vashi, Fort, Bandra" required />
        <label className="block text-sm font-semibold text-ink">
          Category
          <select name="category" className={INPUT} defaultValue="Workshop">
            {CATEGORIES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field name="price" label="Price in rupees" placeholder="700" inputMode="numeric" />
          <Field name="duration" label="Duration in minutes" placeholder="120" inputMode="numeric" />
        </div>
        {/* Both optional, both stored. The sentence says what a blank one means,
            which is the difference between an honest field and a dead one. */}
        <p className="text-xs leading-5 text-muted">
          Both are optional and both are kept. Leave price blank if it varies: we record that as
          unknown rather than as free, and an unknown price can never pass the budget gate.
        </p>

        <Field name="source" label="Your link" placeholder="https://your-site.example" type="url" />
      </div>

      <Notice title="Publishing is an operator action, not a page load" className="mt-5">
        <p>
          A submission does not reach travellers until an operator publishes it from the
          operations console. Until then it exists only on this device, and this page says so rather
          than implying it is live.
        </p>
      </Notice>

      <button className={`mt-5 w-full ${buttonClass("primary")}`} type="submit">
        Submit for review
      </button>

      <p className="mt-3 text-xs leading-5 text-muted" role="status" aria-live="polite">
        {submitted ? (
          <span className="flex items-start gap-2 text-sm font-semibold leading-6 text-green">
            <CheckCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {submitted} is queued for an operator. It reaches Explore only once it is published.
            </span>
          </span>
        ) : null}
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
  inputMode,
  required = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  inputMode?: "numeric";
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        required={required}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
  );
}
