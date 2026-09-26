import { Camera, MapPin } from "@phosphor-icons/react/dist/ssr";
import { StatusLabel } from "@/components/ui";
import type { Experience } from "@/lib/seed";

/**
 * The area photo hero.
 *
 * A full-bleed photograph of the neighborhood, with the record's own status on
 * it, and a caption that cannot be skimmed past: this is the area, not the
 * venue. The catalogue has no venue photography, and a hero that let a reader
 * believe otherwise would be the largest lie on the page, because a hero is the
 * one element nobody reads the small print under.
 *
 * So the caption carries the credit, says what the picture is, and says what it
 * is not. Three claims, all of which the record can back:
 *
 *  1. The credit. `Experience.imageCredit` is the real photographer and licence
 *     short name read from Wikimedia Commons at generation time.
 *  2. The area. `place.area` is on the record.
 *  3. The pin is separate. `records.ts` marks a record `osm` when the pin was
 *     matched to a feature and `inferred` when it is the area centre plus a
 *     fixed offset, and the hero never claims a doorway it cannot show.
 *
 * `alt` is empty on purpose. The image is atmosphere, and an alt attribute
 * describing a neighbourhood the reader cannot verify is a caption in disguise.
 * The `<figcaption>` carries the real text instead.
 */
export function AreaHero({ place }: { place: Experience }) {
  return (
    <figure className="border border-line bg-white">
      <div className="relative h-[260px] sm:h-[340px] lg:h-[420px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={place.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
            <MapPin size={14} aria-hidden="true" />
            {place.category} · {place.area} · {place.zone}
          </p>
          <div className="mt-2">
            <StatusLabel tone={place.statusTone}>{place.status}</StatusLabel>
          </div>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-canvas px-5 py-3 text-xs leading-5 text-muted">
        <Camera size={15} className="shrink-0" aria-hidden="true" />
        <span className="font-bold text-ink">Area photo, not the venue.</span>
        <span>
          {place.imageCredit}. It shows {place.area}, so treat the surroundings as representative and
          anything inside the frame as unverified. The map pin is stated separately, on the Map pin fact
          below.
        </span>
      </figcaption>
    </figure>
  );
}
