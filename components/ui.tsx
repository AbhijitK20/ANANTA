import type { ReactNode } from "react";
import { BookmarkSimple, Compass, House, MapTrifold, UserCircle } from "@phosphor-icons/react/dist/ssr";

export function ButtonLink({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  return <a href={href} className={`rounded-lg px-4 py-3 text-sm font-bold transition-colors ${className}`}>{children}</a>;
}

export function StatusLabel({ tone = "blue", children }: { tone?: "blue" | "green" | "amber"; children: ReactNode }) {
  const colors = { blue: "bg-blueSoft text-blue", green: "bg-greenSoft text-green", amber: "bg-amberSoft text-amber" };
  return <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${colors[tone]}`}>{children}</span>;
}

export function SectionHeading({ eyebrow, title, href }: { eyebrow: string; title: string; href: string }) {
  return <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue">{eyebrow}</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">{title}</h2></div><a href={href} className="flex items-center gap-1 text-sm font-bold text-blue">See all <span aria-hidden="true">→</span></a></div>;
}

export function BottomNav() {
  const items = [{ href: "/", label: "Home", Icon: House }, { href: "/explore", label: "Explore", Icon: MapTrifold }, { href: "/trips", label: "Trips", Icon: Compass }, { href: "/saved", label: "Saved", Icon: BookmarkSimple }, { href: "#profile", label: "Profile", Icon: UserCircle }];
  return <><div className="h-20 lg:hidden" aria-hidden="true" /><nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-line bg-white/95 px-3 py-3 backdrop-blur lg:static lg:mx-5 lg:border-t-0 lg:bg-transparent lg:px-8 lg:py-5"><div className="mx-auto flex w-full max-w-md items-center justify-between lg:max-w-none">{items.map(({ href, label, Icon }, index) => <a key={label} href={href} className={`flex min-w-[58px] flex-col items-center gap-1 text-xs font-semibold ${index === 0 ? "text-blue" : "text-muted"}`}><Icon size={21} weight={index === 0 ? "fill" : "regular"} />{label}</a>)}</div></nav></>;
}
