import Link from "next/link";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { BottomNav, buttonClass } from "@/components/ui";
import { Footer } from "@/components/footer";
import { TONE_TEXT, typeScale } from "@/components/ananta/tokens";
import { DATASET_SIZE } from "@/components/ananta/records";

/**
 * The 404 behind `notFound()`.
 *
 * The defect this replaces was `/experience/anything-garbage` returning HTTP 200
 * and rendering the first record in the catalogue, which is a wrong answer
 * dressed as a right one. This page is the `broken` state from the state table,
 * and it has to do three things: say the record does not exist, say the rest of
 * the product still works, and offer one way forward. A 404 that apologises
 * without a next step is its own dead end.
 *
 * The dataset size is imported, never typed in. `DESIGN-CONTRACT.md:17` bans
 * hard-coded metrics, and a number that drifts is a small lie nobody notices.
 */
export default function ExperienceNotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col bg-white lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-[28px] lg:shadow-card">
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <Link href="/explore" className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeft size={18} /> Back to explore
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-[70ch]" data-ui-state="broken">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">
              404 · No such record
            </p>
            <h1 className={`mt-3 ${typeScale.display}`}>Something failed</h1>
            <p className={`mt-4 ${typeScale.lead} text-muted`}>
              That address does not match any of the {DATASET_SIZE.toLocaleString("en-IN")}{" "}
              places in the catalogue. We would rather say a record is missing than show you a
              different one and let the URL imply otherwise.
            </p>
            <p className={`mt-4 ${typeScale.body} text-muted`}>
              One sentence on what still works: browse, search and the trip builder are all running,
              and every record you open will show where each of its facts came from.
            </p>

            <ul className="mt-6 space-y-2">
              {[
                "The id may have been mistyped, or the record may have been retired.",
                "Nothing was searched on your behalf and no result was invented.",
                "If you followed a link from inside the product, that link is the thing to report.",
              ].map((line) => (
                <li key={line} className={`flex gap-3 ${typeScale.body} text-muted`}>
                  <MagnifyingGlass size={17} className="mt-0.5 shrink-0 text-blue" />
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/explore" className={buttonClass()}>
                Search the catalogue
              </Link>
              <Link href="/" className={buttonClass("secondary")}>
                Back to the start
              </Link>
            </div>
            <p className={`mt-4 ${TONE_TEXT.muted} text-xs`}>
              No identifier from this request was recorded, so there is nothing to attach to a
              report.
            </p>
          </div>
        </div>
        <Footer />
        <BottomNav />
      </div>
    </main>
  );
}
