import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

/**
 * Terms, written to describe what the code does and nothing more.
 *
 * There is no payments flow, no booking completion, no dispute process and no
 * jurisdiction in this product, by decision rather than by omission. The old
 * draft had a "Booking simulation" section, which described a flow that does not
 * exist. A terms page that describes a feature nobody built is a commitment the
 * product has not made.
 *
 * It must still receive legal review before any public launch, and saying so is
 * more useful than confident text nobody has checked.
 */

type Point = { term: string; body: string };

const USE: Point[] = [
  {
    term: "What this is",
    body: "Ananta is a demonstration of a local discovery engine. It ranks places that fit the time, budget, accessibility needs, weather and distance you specify, and it tells you why anything was left out. It is not a booking service, a ticketing service or a directory of verified businesses.",
  },
  {
    term: "No accounts, no server",
    body: "The application has no account system and no server of its own. Everything you save or plan is stored in your own browser. Clearing your browsing data deletes it and it cannot be recovered.",
  },
  {
    term: "What we store about you",
    body: "Nothing that leaves your device. The complete list of browser storage keys is on the privacy page, and it is enumerated from the source rather than written by hand.",
  },
];

const LISTINGS: Point[] = [
  {
    term: "A provider submission",
    body: "A listing you submit is a claim you make about your own place. It is stored on your device, and it does not reach travellers until an operator publishes it. Publishing is not an endorsement or a verification of your facts.",
  },
  {
    term: "Availability is not a booking",
    body: "Setting a listing to Closed removes it from recommendations on this device. That is a signal the engine reads. It does not cancel anything, reserve anything, or notify anyone, because there is no reservation system.",
  },
  {
    term: "Requests are messages",
    body: "A request is one traveller's message. Accepting one records your answer with a date. It is not a booking, not a payment, and not a commitment on either side. There is no payment flow, no commission, no payout and no dispute process in this product, by design.",
  },
  {
    term: "Unmet demand is aggregated",
    body: "The demand feed groups refusals by area and interest so repeats collapse. Counts are real and are never rounded up. A group with no provider who can act on it says so rather than inventing an audience.",
  },
];

const RECORDS: Point[] = [
  {
    term: "Where the facts come from",
    body: "Every field on every record carries its own provenance and its own confidence. A hand-entered fact, a value matched to a named public source, a number computed by our own arithmetic, and a field nothing is known about are four different things, and the interface distinguishes all four.",
  },
  {
    term: "What we do not know",
    body: "Most records in the catalogue have no opening hours on record. Where a required fact is unknown, the engine refuses to judge rather than guessing, and says which fact it would not claim. A refusal is a designed answer, not an error.",
  },
  {
    term: "External media",
    body: "Photographs come from Wikimedia Commons and render with the photographer credited. Videos are checked against their live source before entering the catalogue, and only media an operator has approved appears. Media is never treated as proof that a place is open, free or available.",
  },
  {
    term: "Travel times",
    body: "Where live street routing is unavailable the application shows a straight-line estimate and labels it as one. An estimate is never presented as a route.",
  },
];

const LIMITS: Point[] = [
  {
    term: "No warranty",
    body: "This is demonstration software provided as it is. Verified information can still be wrong or out of date, and an estimate is an estimate. Do not rely on it for anything where being wrong would cost you money or put someone at risk.",
  },
  {
    term: "No liability",
    body: "To the extent permitted by law, the authors accept no liability for decisions made on the basis of this application, including visiting a place that turned out to be closed, differently priced, or inaccessible.",
  },
  {
    term: "Third-party services",
    body: "Map tiles, street routing and media are fetched from public third-party services which may be unavailable. The application degrades to a labelled estimate or a visible error rather than failing silently.",
  },
];

const SECTIONS: { title: string; points: Point[] }[] = [
  { title: "Using this application", points: USE },
  { title: "Listings, availability and requests", points: LISTINGS },
  { title: "Records, facts and estimates", points: RECORDS },
  { title: "Limits", points: LIMITS },
];

export default function TermsPage() {
  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <article className="mx-auto max-w-[760px] bg-white px-6 py-12 sm:px-10 lg:my-8 lg:rounded-2xl lg:px-16 lg:py-16 lg:shadow-card">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue">
          <ArrowLeft size={16} aria-hidden="true" /> Ananta
        </a>

        <p className="mt-12 text-xs font-bold uppercase tracking-[0.14em] text-blue">Terms</p>
        <h1 className="mt-3 text-[28px] font-bold leading-[34px] tracking-[-0.04em]">
          What using this application does and does not mean
        </h1>
        <p className="mt-5 text-[17px] leading-7 text-muted">
          Ananta is a demonstration of a fit-first local discovery engine. These terms describe what
          it actually does. Where it does not do something, that is said rather than left for you
          to discover.
        </p>

        <p className="mt-5 border border-line bg-canvas p-4 text-sm leading-6 text-muted">
          <span className="font-bold text-ink">This page is a product draft.</span> It must receive
          legal review before any public launch. It names no jurisdiction, no data controller and no
          compliance standard, because none has been decided. Inventing them would be a false claim
          in the one document a reader checks before trusting you.
        </p>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mt-10 border-t border-line pt-6">
            <h2 className="text-xl font-bold tracking-[-0.03em]">{section.title}</h2>
            <dl className="mt-4 grid gap-5">
              {section.points.map((point) => (
                <div key={point.term}>
                  <dt className="text-sm font-bold text-ink">{point.term}</dt>
                  <dd className="mt-1 text-sm leading-7 text-muted">{point.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Contact and jurisdiction</h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            No support address is printed here because none exists. A contact address, a governing
            jurisdiction and an entity responsible for a deployment have to be settled before a
            public launch. The{" "}
            <a href="/contact" className="font-bold text-blue underline">
              contact page
            </a>{" "}
            routes each kind of message to the mechanism in the application that genuinely handles
            it, including reporting a record that is wrong.
          </p>
        </section>

        <p className="mt-10 border-t border-line pt-6 text-xs leading-5 text-muted">
          Last reviewed against the source on the commit that introduced this page.
        </p>

        <a href="/" className="mt-10 inline-block text-sm font-bold text-blue">
          Return to Ananta
        </a>
      </article>
    </main>
  );
}
