import Link from "next/link";
import { ArrowRight, MapPin, Storefront, Wrench } from "@phosphor-icons/react/dist/ssr";
import { LegalCaveat, LegalDocument, LegalSection } from "@/components/legal/document";
import { Notice } from "@/components/workspace/notice";

/**
 * Contact, without inventing a contact.
 *
 * This product has no server, so there is no inbox to write to and no operator
 * watching it. Putting a fake email address here would be the exact kind of
 * fabricated claim this repository exists to avoid, so instead this page routes
 * every kind of message to the mechanism that genuinely handles it, and says
 * plainly which is which.
 *
 * "Report incorrect information" is a real, working, on-device report: it writes
 * to `localStorage` via `lib/reports.ts` and appears in the operator queue at
 * `/admin/operations`. That is a real feedback loop with a real limitation, and
 * both halves of that sentence are on this page.
 *
 * The first draft of this page put that in an amber flag box, which read as a
 * warning about something broken. It is not broken. It is the design, stated
 * once, calmly, and then the rest of the page is three working routes.
 */
const ROUTES = [
  {
    href: "/explore",
    icon: MapPin,
    title: "A place is wrong, missing, or has moved",
    body: "Open the place and use Report incorrect information on its page. The report carries the record id, your reason and your note into the operator queue, where an admin can verify it or mark it stale. Because the app has no server, the report stays on this device: it reaches the operator queue on this browser, not on theirs.",
  },
  {
    href: "/provider",
    icon: Storefront,
    title: "You run a place and want to be listed, or to change your details",
    body: "The provider workspace takes a listing with a real price, a real duration and a link, and it writes an availability signal that the feasibility gate reads immediately. Closing a listing removes it from recommendations on this device. Publishing a new listing is an operator action, taken in the operations queue.",
  },
  {
    href: "/admin/operations",
    icon: Wrench,
    title: "You are the operator and want to review or publish",
    body: "The operations queue holds provider submissions, traveller reports, event changes, media review and unmet demand. Publishing a submission is the action that puts a new place into Explore. Every queue action is unauthenticated: anyone who loads this page can press them. That is a deliberate demo scope, and it is the reason this product should not be deployed on a public URL as it stands.",
  },
];

export default function ContactPage() {
  return (
    <LegalDocument
      kicker="Contact"
      title="How to reach us, honestly"
      lead="There is no support inbox on this product, so there is no email address to print here. What follows is the real mechanism for each kind of message, and the real limitation of each one."
      aside={
        <LegalCaveat>
          If you came here for a mailbox, this is the honest version of one. An address that nobody
          reads is worse than no address, and printing one would be the kind of claim this
          application exists to avoid.
        </LegalCaveat>
      }
      closing="The routes above are the only ones that exist. A future version with a real support address will say so on this page rather than in a changelog."
    >
      {ROUTES.length === 0 ? (
        /* A real failure, not a hypothetical one. `ROUTES` is the data this page
           exists to render, and an empty table would otherwise leave a blank
           section under a confident heading. */
        <Notice tone="info" title="The contact routes failed to load" className="mt-10">
          <p>
            The three paths below could not be listed. The report mechanism they point at still
            works: open any place from Explore and use Report incorrect information on its page.
          </p>
        </Notice>
      ) : (
        ROUTES.map((route, index) => {
          const Icon = route.icon;
          return (
            <LegalSection key={route.href} index={index + 1} title={route.title}>
              <div className="card flex items-start gap-3 p-4">
                <Icon size={20} className="mt-0.5 shrink-0 text-blue" aria-hidden="true" />
                <div>
                  <p className="text-sm leading-6 text-muted">{route.body}</p>
                  <Link
                    href={route.href}
                    className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-bold text-blue"
                  >
                    Open {route.href}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </LegalSection>
          );
        })
      )}

      <LegalSection index={ROUTES.length + 1} title="What a report actually does">
        <p>
          A report carries the record id, the reason you picked and your note into the operator
          queue at /admin/operations, where an admin can verify a record or mark it stale. It is
          read by whoever is operating this build, which today means anyone who loads that page,
          because no operator is on call. It is not emailed anywhere and it does not leave your
          browser.
        </p>
        <div>
          <Link
            href="/explore"
            className="inline-flex min-h-[44px] items-center gap-2 rounded border border-blue px-4 py-2 text-sm font-bold text-blue transition-colors duration-120 hover:bg-blueSoft"
          >
            Open a place to report it
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </LegalSection>

      <LegalSection index={ROUTES.length + 2} title="What this product is not">
        <p>
          Ananta is a local discovery demo built as a static application. It has no accounts, no
          payments, no bookings that complete anywhere, and no way for us to receive anything you
          type unless you press a button that writes it to your own browser. We would rather say
          that plainly than print a contact form that quietly discards what you wrote.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
