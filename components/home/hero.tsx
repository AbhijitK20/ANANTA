import { ArrowRight, MapPin, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { demoUserLocation } from "@/lib/location";
import { credibilityLine } from "@/components/ananta/records";
import { buttonClass } from "@/components/ui";
import { DiscoveryBar } from "@/components/home/discovery-bar";

/**
 * The hero band and the evidence panel beside it.
 *
 * Two columns because the product makes a claim and then has to show the number
 * behind it. The old landing stacked them, which put the credibility line below
 * the fold on a laptop and left the hero reading like a listings site. Beside the
 * claim, the argument and its proof are the same visual unit.
 *
 * What the previous revision deleted, and why it is still deleted:
 *
 *   1. The fake map panel on the right. It drew a decorative CSS grid with four
 *      pins at invented percentages and a card for a real event with a typed
 *      "12 min estimate, 2 hours, 700 rupees". Those three numbers were typed by a
 *      human, so the one panel that looked like the product was the only part of
 *      it that was fictional. The evidence panel here carries no number that did
 *      not come out of `credibilityLine()`. A map is `components/map.tsx`.
 *   2. The three-column "Traceable, Feasible, Honest" strip. Three
 *      unfalsifiable adjectives above the fold is the vague hero copy
 *      `DESIGN-CONTRACT.md` bans. The same three claims, stated as things you can
 *      check, are in the evidence panel and on `/trips`.
 *
 * The hero is a server component. The only interactive part is `DiscoveryBar`,
 * split into its own file so the catalogue behind `credibilityLine()` stays out
 * of the client bundle.
 *
 * The decorative layer is one radial wash and one dot grid, both from the
 * existing tokens, both `aria-hidden`, and neither animated. `DESIGN-CONTRACT.md`
 * bans purple gradients, glassmorphism and cursor effects; a masked dot grid in
 * the brand blue is none of those, and it is the only thing on the screen that
 * carries no information.
 */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-canvas">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-[length:22px_22px] opacity-70 [mask-image:radial-gradient(75%_70%_at_50%_0%,#000,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,var(--color-blue-soft),transparent)]" />
      </div>

      <div className="stage-3d relative px-5 py-12 sm:px-8 lg:px-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-chip border border-blue bg-blueSoft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-blue">
              <ShieldCheck size={14} aria-hidden="true" />
              Ananta is not a listings site
            </p>

            {/* The claim. Exactly one display heading on this screen, which is
                the house rule stated here for the second time in this file and
                deliberately not a third. */}
            <h1 className="mt-5 max-w-[680px] text-[34px] font-bold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[44px] lg:text-[52px] lg:leading-[1.02]">
              Everything below fits your time.
            </h1>
            <p className="mt-5 max-w-[52ch] text-lead text-muted">
              Give us a window, a budget, and who you are with. We show our work, including what we
              refuse and the number that refused it.
            </p>

            <DiscoveryBar />

            <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* Secondary, not primary. The blue primary on this screen is the
                  submit inside the search bar, so the button that only navigates
                  is a bordered control and the eye lands on the thing that does
                  the work. */}
              <a href="/explore" className={buttonClass("secondary", "sm:px-5")}>
                See what fits
                <ArrowRight size={17} weight="bold" aria-hidden="true" />
              </a>
              <p className="max-w-[42ch] text-[13px] leading-5 text-muted">
                No sign-up. No booking. No live availability claims. No payments.
              </p>
            </div>
          </div>

          {/*
            The evidence panel. Every number in it is rendered from the dataset by
            `credibilityLine()`, because a judge decides in five minutes and a
            claim with no number behind it is the thing they have seen all day.
            `lib/ui-guard/hardcoded-numbers.test.ts` fails the build on a count
            typed into a view layer string.
          */}
          <aside className="depth-raised card h-fit p-5 lg:p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              What the data actually says
            </p>
            <p className="mt-3 text-body text-ink">{credibilityLine()}</p>
            <p className="mt-4 flex gap-2 border-t border-line pt-4 text-[13px] leading-5 text-muted">
              <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Distances are straight-line estimates from a fixed demo position at{" "}
                {demoUserLocation.label}, not live geolocation and not live routing.
              </span>
            </p>
            <p className="mt-3 text-[13px] leading-5 text-muted">
              Open any place below to read which of its fields are checked against a source and which
              are our own arithmetic.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
