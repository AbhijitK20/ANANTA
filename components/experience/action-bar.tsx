import { AddToPlanButton } from "@/components/plan-button";
import { ReportButton } from "@/components/report-button";
import { SaveButton } from "@/components/save-button";
import { ShareButton } from "@/components/share-button";

/**
 * Save, plan, share, report, in one sticky bar.
 *
 * These four were scattered: save and share in the header, add to plan and
 * report in the aside, and the aside is below the fold on a phone, so the two
 * actions that change something were the two a reader had to scroll to find.
 * One bar, always reachable.
 *
 * **No `backdrop-blur`, no `transform`, no `z-index` on the bar, and that is
 * load bearing rather than an omission.** `backdrop-filter`, `transform` and
 * `z-index` other than `auto` all change what a `position: fixed` descendant is
 * positioned against, and `ReportButton` opens a `fixed inset-0` dialog. A
 * translucent sticky bar would have moved that dialog's containing block onto the
 * bar and shrunk the dialog to a 40 pixel strip. A solid `bg-white` bar with no
 * z-index keeps the dialog anchored to the viewport, and the bar still paints
 * above the content that scrolls under it, because `sticky` is a positioned
 * element and positioned elements paint above in-flow blocks.
 *
 * The three controls are the shared ones. Save is a state (`aria-pressed`, the
 * icon fills), add to plan is a state, report is an act. None of them is
 * reimplemented here, and none of their copy is rewritten, so a change to what
 * "saved" means lands on every screen at once.
 */
export function PlaceActionBar({
  place,
  priceLabel,
}: {
  place: { id: string; name: string };
  /** The headline price, so the bar answers "how much" without a scroll. */
  priceLabel: string;
}) {
  return (
    <div className="sticky top-0 border-b border-line bg-white px-5 py-3 sm:px-8">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <p className="mr-auto min-w-0 flex-1 truncate text-sm font-bold">{place.name}</p>
        <span className="shrink-0 text-sm font-bold text-blue">{priceLabel}</span>
        <SaveButton experienceId={place.id} experienceName={place.name} />
        <ShareButton title={place.name} />
        <div className="w-[196px] max-w-full">
          <AddToPlanButton experienceId={place.id} experienceName={place.name} />
        </div>
        <ReportButton recordId={place.id} recordTitle={place.name} />
      </div>
    </div>
  );
}
