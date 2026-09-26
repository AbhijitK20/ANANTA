import { demoUserLocation } from "@/lib/location";

/**
 * One footer, on every traveller screen.
 *
 * `/privacy` and `/terms` used to be reachable only from the desktop top nav,
 * which made them unreachable on the mobile demo viewport, and `/provider` and
 * `/admin/operations` had no inbound link at all even though the demo script
 * opens both mid-demo. One footer fixes all four.
 */

const PRODUCT = [
  { href: "/explore", label: "Explore" },
  { href: "/trips", label: "Trips" },
  { href: "/events", label: "Events" },
  { href: "/saved", label: "Saved" },
  { href: "/profile", label: "Profile" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const SIDES = [
  { href: "/provider", label: "For providers" },
  { href: "/admin/operations", label: "Operations" },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-canvas px-5 py-10 sm:px-8 lg:px-14">
      <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
        <div className="max-w-md">
          <p className="text-sm font-bold tracking-[-0.03em]">Ananta</p>
          <p className="mt-2 text-xs leading-5 text-muted">
            Fit-first local discovery for Mumbai and Navi Mumbai. Distances are straight-line estimates
            measured from a fixed demo position at {demoUserLocation.label}, not live geolocation and not
            live routing. Prices, durations, hours, and availability on most records are deterministic demo
            estimates, and every field says which it is.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <FooterGroup title="Product" links={PRODUCT} />
          <FooterGroup title="Legal" links={LEGAL} />
          <FooterGroup title="Other sides" links={SIDES} />
        </div>
      </div>
      <p className="mt-8 border-t border-line pt-5 text-[11px] leading-5 text-muted">
        No account, no server, no behavioural profile uploaded. Saved places, draft plans, reports, and your
        weight edits live in this browser&apos;s local storage and disappear when you clear site data.
      </p>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} className="text-sm font-semibold text-ink hover:text-blue">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
