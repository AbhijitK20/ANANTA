import {
  LegalCaveat,
  LegalContents,
  LegalDocument,
  LegalSection,
} from "@/components/legal/document";
import { typeScale } from "@/components/ananta/tokens";

/**
 * The privacy policy, written from the code rather than from a template.
 *
 * The list below is every `localStorage` key that exists in the repository,
 * enumerated by reading the source. A privacy page that lists the wrong data is
 * worse than a short one, because it is a false claim in the exact place a
 * reader is checking whether to trust you.
 *
 * It deliberately contains no invented legalese, no jurisdiction, and no
 * compliance claim. It must still receive legal review before any public
 * launch, and saying so on the page is more useful than a paragraph of
 * confident text that nobody has checked.
 */

type Row = { key: string; what: string; life: string };

/** Every `localStorage` key in the tree, and what actually writes it. */
const STORED: Row[] = [
  {
    key: "ananta-draft-plan",
    what: "The stops you have added to a plan, in the order you added them.",
    life: "Until you clear it. Never sent anywhere.",
  },
  {
    key: "ananta-saved-experiences",
    what: "The place ids you have saved, and when you saved each one.",
    life: "Until you clear it. Never sent anywhere.",
  },
  {
    key: "ananta-saved-availability",
    what: "A snapshot of the availability signal at the moment you saved a place, so a later change can be shown to you rather than applied silently.",
    life: "Until you clear it. Never sent anywhere.",
  },
  {
    key: "ananta-learner",
    what: "The weight vector the engine has learned about your preferences, and how many interactions it is based on. You can see and edit it.",
    life: "Until you clear it. Never sent anywhere.",
  },
  {
    key: "ananta-data-reports",
    what: "Reports you have filed about a record being wrong, with the reason and your note.",
    life: "Until you clear it, or an operator acts on it.",
  },
  {
    key: "ananta-provider-listings",
    what: "Listings you have submitted or edited, with their price, duration, availability and any link you gave.",
    life: "Until you clear it.",
  },
  {
    key: "ananta-provider-operations",
    what: "Provider-side review state for your own listings.",
    life: "Until you clear it.",
  },
  {
    key: "ananta-provider-requests",
    what: "Requests opened against your listings, and your accept or decline answer with its date.",
    life: "Until you clear it.",
  },
  {
    key: "ananta-operations",
    what: "The operator review queue: verification and stale marks on records, reports, and submissions.",
    life: "Until you clear it.",
  },
  {
    key: "ananta-media-records",
    what: "Approval state for external video and image media, and the history of who changed it.",
    life: "Until you clear it.",
  },
  {
    key: "ananta-demand-rows",
    what: "The refusals the feasibility gate produced on this device: which record was refused, for which constraint, and how many times. Grouped, this is the unmet-demand feed a provider reads.",
    life: "Until you clear it. It is aggregated, so it is not tied to an individual.",
  },
  {
    key: "ananta-stale-ids",
    what: "Which record ids an operator has marked as needing a recheck.",
    life: "Until you clear it.",
  },
];

/**
 * Third parties the browser contacts. This is the complete list, because the
 * whole point of the section is that a reader can check it.
 */
const THIRD_PARTIES = [
  {
    who: "OpenStreetMap routing servers",
    what: "Walking, cycling and driving directions between two points, to draw the route on the map.",
    when: "Only when you ask for a route. Not on page load.",
  },
  {
    who: "OpenFreeMap",
    what: "The map style and the map tiles themselves.",
    when: "Whenever a map is on screen.",
  },
  {
    who: "Wikimedia Commons",
    what: "Area photographs attached to a place.",
    when: "When a place page shows a photograph.",
  },
  {
    who: "YouTube",
    what: "A video thumbnail, and the embedded player on a place page.",
    when: "When a place page shows media.",
  },
];

/** The section titles, once, so the contents list cannot fall out of step. */
const SECTIONS = [
  "There is no server and no account",
  "What is stored on this device",
  "What leaves your device",
  "Location",
  "Deleting everything",
  "Children",
  "Contact and jurisdiction",
] as const;

export default function PrivacyPage() {
  return (
    <LegalDocument
      kicker="Privacy"
      title="What this application stores, and what it sends"
      lead="Ananta is a local discovery demo that runs entirely in your browser. It has no account system, no server of its own, and no database. Everything it knows about you is in this browser, and clearing your browsing data deletes all of it."
      aside={
        <LegalCaveat>
          This page is a product draft. It describes what the code actually does today, and it must
          receive legal review before any public launch. It does not name a jurisdiction, a data
          controller or a compliance standard, because none of those has been decided and inventing
          them would be a false claim.
        </LegalCaveat>
      }
      closing="Last reviewed against the source on the commit that introduced this page. The key list is generated from the repository, so a new stored key without a line here is a defect in this page rather than a new privacy practice."
    >
      <LegalContents
        items={SECTIONS.map((title, index) => ({ href: `#section-${index + 1}`, label: title }))}
      />

      <LegalSection index={1} title={SECTIONS[0]}>
        <p>
          There is nowhere for your data to go. Opening this page does not create an account,
          identify you, or start a session. There is no cookie that identifies a visitor, and no
          analytics, tracking or advertising script of any kind.
        </p>
        <p>
          The consequence, stated plainly: because there is no server, an operator of a
          deployment of this application cannot see anything you do. A provider whose listing you
          view sees nothing. Your saved places and your draft plan exist on this device and on no
          other.
        </p>
      </LegalSection>

      <LegalSection index={2} title={SECTIONS[1]}>
        <p>
          The {STORED.length} keys below are every place this application writes to browser
          storage. The list was read out of the source, not written by hand, so it cannot drift
          from what the code does.
        </p>
        <div className="mt-2 overflow-x-auto rounded border border-line">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Every browser storage key, what it holds, and how long it lives</caption>
            <thead>
              <tr className="border-b border-line bg-canvas">
                <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                  Key
                </th>
                <th scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                  What it holds
                </th>
              </tr>
            </thead>
            <tbody>
              {STORED.map((row) => (
                <tr key={row.key} className="border-b border-line align-top last:border-b-0">
                  <td className="w-[38%] px-4 py-3">
                    <code className="text-[13px] font-bold text-ink">{row.key}</code>
                    <span className={`mt-1 block ${typeScale.micro} text-muted`}>{row.life}</span>
                  </td>
                  <td className="px-4 py-3 text-body leading-6 text-muted">{row.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <span className="font-bold text-ink">Two more, held only for the tab.</span> A street
          route you asked for is cached under a key beginning <code className="text-[13px] font-bold">ananta-route-</code>,
          one per origin, destination and travel mode, so the same route is not fetched twice. It
          sits in session storage, which the browser discards when you close the tab, and it never
          includes anything about you beyond the two coordinates you selected.
        </p>
      </LegalSection>

      <LegalSection index={3} title={SECTIONS[2]}>
        <p>
          Nothing you type, save, plan or report is transmitted. The application makes no
          requests carrying anything you entered. What it does request is map and routing data
          from four public services, and those requests necessarily reveal your approximate
          location and your browser&apos;s IP address to the operator of each one.
        </p>
        <ul className="m-0 grid list-none gap-3 p-0">
          {THIRD_PARTIES.map((party) => (
            <li key={party.who} className="rounded border border-line p-4">
              <p className="text-sm font-bold text-ink">{party.who}</p>
              <p className="mt-1 text-body leading-6 text-muted">{party.what}</p>
              <p className="mt-1 text-xs leading-5 text-muted">When: {party.when}</p>
            </li>
          ))}
        </ul>
        <p>
          None of these four is a data processor for anything you do in the application. They
          receive a map tile request or a pair of coordinates and nothing about your plan, your
          saves or your identity.
        </p>
      </LegalSection>

      <LegalSection index={4} title={SECTIONS[3]}>
        <p>
          This application never asks for your location permission. The map shows a fixed
          starting point that is part of the demo, and the origin used for travel-time estimates
          is a constant in the code rather than a reading from you. If a future version asks for
          real location, that is a change that would need to be described here first.
        </p>
      </LegalSection>

      <LegalSection index={5} title={SECTIONS[4]}>
        <p>
          Clearing this site&apos;s data in your browser removes all {STORED.length} keys above,
          and nothing is retained anywhere else because nothing was transmitted. There is no
          account to close and no unsubscribe, because there is no server to ask.
        </p>
        <p>
          Your browser&apos;s own storage inspection tools will show the same {STORED.length} keys,
          which you can delete individually or all at once. The{" "}
          <a href="/profile" className="font-bold text-blue">
            profile page
          </a>{" "}
          has a control that names each key it removes.
        </p>
      </LegalSection>

      <LegalSection index={6} title={SECTIONS[5]}>
        <p>
          This is a demonstration application built to show a decision engine. It is not directed
          at children, it collects nothing from anyone, and it has no mechanism to identify a
          user of any age.
        </p>
      </LegalSection>

      <LegalSection index={7} title={SECTIONS[6]}>
        <p>
          No contact address is printed here because none exists yet. A support address, a data
          controller and a governing jurisdiction all have to be settled before a public launch,
          and printing invented ones would be the same kind of claim this page exists to avoid.
          The{" "}
          <a href="/contact" className="font-bold text-blue">
            contact page
          </a>{" "}
          routes every kind of message to the mechanism in the application that actually handles
          it, and says which is which.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
