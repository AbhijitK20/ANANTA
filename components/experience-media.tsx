"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, PlayCircle } from "@phosphor-icons/react/dist/ssr";
import { approvedMediaFor, type ResolvedMedia } from "@/lib/media";
import { mediaSeedRecords, readMediaRecords, type MediaRecord } from "@/lib/media-store";

export function ExperienceMedia({ experienceId, fallbackTitle }: { experienceId: string; fallbackTitle: string }) {
  const [records, setRecords] = useState<MediaRecord[]>(mediaSeedRecords);
  useEffect(() => {
    const sync = () => setRecords(readMediaRecords());
    sync();
    window.addEventListener("local-tourist-media-change", sync);
    return () => window.removeEventListener("local-tourist-media-change", sync);
  }, []);

  const media = approvedMediaFor(experienceId, records);

  if (!media.length) {
    return (
      <div className="mt-4 border border-line p-4">
        <div className="flex h-32 items-center justify-center bg-[#eef2f2]"><PlayCircle size={42} weight="thin" className="text-blue" /></div>
        <p className="mt-3 font-bold">No approved video for this place yet</p>
        <p className="mt-1 text-sm text-muted">External media slot · Source awaiting verification</p>
      </div>
    );
  }
  return <div className="mt-4 space-y-4">{media.map((item) => <MediaCard key={item.media.id} item={item} fallbackTitle={fallbackTitle} />)}</div>;
}

function MediaCard({ item, fallbackTitle }: { item: ResolvedMedia; fallbackTitle: string }) {
  void fallbackTitle;
  return (
    <div className="border border-line p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{item.platform} · {item.media.mediaType} · {item.media.publishedAt}</p>
          <h3 className="mt-2 font-bold">{item.media.title}</h3>
          <p className="mt-1 text-sm text-muted">By {item.media.creator}</p>
        </div>
        {item.embeddable ? <PlayCircle size={22} className="shrink-0 text-blue" /> : <ArrowSquareOut size={22} className="shrink-0 text-blue" />}
      </div>
      {item.embeddable ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className="mt-4 block">
          {/* Static thumbnail opens the platform; videos never autoplay in cards. */}
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbUrl} alt={`Thumbnail for ${item.media.title}`} className="h-48 w-full border border-line object-cover" />
            <span className="absolute inset-0 flex items-center justify-center"><PlayCircle size={46} weight="fill" className="text-white drop-shadow" /></span>
            <span className="absolute bottom-2 right-2 rounded bg-ink/70 px-2 py-1 text-[11px] font-bold text-white">YouTube</span>
          </div>
        </a>
      ) : (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-bold text-ink hover:border-blue hover:text-blue">
          {item.label} <ArrowSquareOut size={15} />
        </a>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">{item.media.note}</p>
    </div>
  );
}
