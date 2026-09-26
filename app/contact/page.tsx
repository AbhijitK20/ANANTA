import Link from "next/link";
import { ArrowLeft, Flag, MapPin, Storefront, Wrench } from "@phosphor-icons/react/dist/ssr";

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
    <main id="main-content" className="min-h-screen bg-canvas">
      <article className="mx-auto max-w-3xl bg-white px-6 py-12 sm:px-10 lg:my-8 lg:rounded-2xl lg:px-16 lg:py-16 lg:shadow-card">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue">
          <ArrowLeft size={16} /> Ananta
        </Link>

        <p className="mt-12 text-xs font-bold uppercase tracking-[0.14em] text-blue">Contact</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.05em]">How to reach us, honestly</h1>

        <div className="mt-6 flex items-start gap-3 border border-line bg-[#fbfcfd] p-4">
          <Flag size={18} className="mt-0.5 shrink-0 text-amber" />
          <p className="text-sm leading-6 text-muted">
            This product has no server and no operator on call. There is no support
            inbox, so we have not printed an email address that nobody would read.
            Everything below is a real mechanism in the app, with its real
            limitation stated. If you expected a mailbox, this is the honest
            version of one.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          {ROUTES.map((route) => {
            const Icon = route.icon;
            return (
              <section key={route.href} className="border border-line p-5">
                <div className="flex items-start gap-3">
                  <Icon size={20} className="mt-0.5 shrink-0 text-blue" />
                  <div>
                    <h2 className="text-lg font-bold">{route.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted">{route.body}</p>
                    <Link
                      href={route.href}
                      className="mt-3 inline-block text-sm font-bold text-blue underline"
                    >
                      Open {route.href}
                    </Link>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-xl font-bold">What this product is not</h2>
          <p className="mt-3 leading-7 text-muted">
            Ananta is a local discovery demo built as a static application. It has
            no accounts, no payments, no bookings that complete anywhere, and no
            way for us to receive anything you type unless you press a button that
            writes it to your own browser. We would rather say that plainly than
            print a contact form that quietly discards what you wrote.
          </p>
        </section>

        <Link href="/" className="mt-12 inline-block text-sm font-bold text-blue">
          Return to Ananta
        </Link>
      </article>
    </main>
  );
}
