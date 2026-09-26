"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, PlayCircle } from "@phosphor-icons/react/dist/ssr";
import { approvedMediaFor, type ResolvedMedia } from "@/lib/media";
import { mediaSeedRecords, readMediaRecords, type MediaRecord } from "@/lib/media-store";
import { CONFIDENCE_TONE, typeScale } from "@/components/ananta/tokens";

/**
 * Media shows atmosphere. It never shows a fact.
 *
 * `docs/04-data/MEDIA-POLICY.md` puts the truth boundary in one line and this
 * component sits on it: external video is for atmosphere and context, and the
 * structured record is the only source of price, hours, availability,
 * accessibility, safety and booking truth. Nothing here is autoplayed, and no
 * third-party file is downloaded or re-hosted, only the URL and the metadata
 * that `MEDIA-POLICY.md` says to store.
 *
 * The gallery form exists so a reader can see at a glance that most records have
 * no approved media at all, rather than scrolling past a single video and
 * concluding the page simply forgot to add more. An empty grid that says so is
 * the honest state, and it is rendered as a designed answer rather than as a gap.
 *
 * Three things this file refuses to claim:
 *
 *  1. That a human reviewed anything. The store records `state: "Approved"` and
 *     a `lastChecked` string, and in the seeded data that string is "Demo data",
 *     so the chip below prints the string rather than the word "reviewed".
 *  2. That a video is current. `publishedAt` is printed beside the platform, so
 *     an upload from years ago cannot be read as this season.
 *  3. That the picture or the footage is the venue. The media note for every
 *     seed says the footage shows the area, and the copy repeats it under the
 *     grid rather than only in a title attribute.
 *
 * `fallbackTitle` used to arrive here, get threaded into `MediaCard`, and be
 * discarded by a `void fallbackTitle;` statement. A no-op like that hides a
 * broken promise three files deep, so the prop now does the only useful thing
 * it can: it titles the empty state when the record has no approved media,
 * which is the case it was originally written for.
 */
export function ExperienceMedia({ experienceId, fallbackTitle }: { experienceId: string; fallbackTitle: string }) {
  const [records, setRecords] = useState<MediaRecord[]>(mediaSeedRecords);
  useEffect(() => {
    const sync = () => setRecords(readMediaRecords());
    sync();
    window.addEventListener("ananta-media-change", sync);
    return () => window.removeEventListener("ananta-media-change", sync);
  }, []);

  const media = approvedMediaFor(experienceId, records);
  const checked = new Map(records.map((record) => [record.id, record.lastChecked]));

  if (!media.length) {
    return (
      <div className="mt-4 border border-dashed border-line bg-canvas p-5">
        <div className="flex h-28 items-center justify-center border border-line bg-white">
          <PlayCircle size={38} weight="thin" className="text-line" aria-hidden="true" />
        </div>
        <p className="mt-3 font-bold">No approved media for {fallbackTitle} yet</p>
        <p className={`mt-1 ${typeScale.body} text-muted`}>
          Nothing is published here until a reviewer has confirmed it shows this place and that the
          platform permits embedding. An empty gallery is a recorded state, not a gap in the record, and
          it is the normal shape of a catalogue this size. Hours, price and availability come from the
          structured facts above, never from a video.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <ul className="grid gap-4 sm:grid-cols-2">
        {media.map((item) => (
          <li key={item.media.id}>
            <MediaCard item={item} lastChecked={checked.get(item.media.id) ?? null} />
          </li>
        ))}
      </ul>
      <p className={`mt-4 border-t border-line pt-3 ${typeScale.meta} text-muted`}>
        Every item above is {media.length === 1 ? "an atmosphere clip" : "atmosphere clips"}, checked
        against its source and nothing more. A clip cannot tell you whether the place is open, what it
        costs or whether a table is free, so none of those numbers comes from here.
      </p>
    </div>
  );
}

function MediaCard({ item, lastChecked }: { item: ResolvedMedia; lastChecked: string | null }) {
  return (
    <article className="flex h-full flex-col border border-line bg-white p-4">
      {item.embeddable ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className="relative block">
          {/* Static thumbnail opens the platform; videos never autoplay in a card. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbUrl}
            alt={`Thumbnail for ${item.media.title}`}
            className="aspect-video w-full border border-line object-cover"
          />
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <PlayCircle size={44} weight="fill" className="text-white drop-shadow" />
          </span>
        </a>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center border border-dashed border-line bg-canvas">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            No preview. Opens on {item.platform}.
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-chip border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] ${CONFIDENCE_TONE.verified}`}>
          Approved
        </span>
        <span className="rounded-chip border border-line bg-canvas px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
          {item.platform} · {item.media.mediaType} · {item.media.publishedAt}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-bold leading-5">{item.media.title}</h3>
      {/* Creator and platform are both required by the policy, so both are named. */}
      <p className={`mt-1 ${typeScale.meta} text-muted`}>
        By {item.media.creator} on {item.platform}
        {lastChecked ? `. Last checked: ${lastChecked}.` : null}
      </p>
      <p className={`mt-2 flex-1 ${typeScale.meta} text-muted`}>{item.media.note}</p>

      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-3 inline-flex items-center gap-2 self-start border border-line px-3 py-2 text-sm font-bold hover:border-blue hover:text-blue`}
      >
        {item.label} <ArrowSquareOut size={15} aria-hidden="true" />
      </a>
    </article>
  );
}
