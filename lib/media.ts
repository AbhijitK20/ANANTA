import type { MediaSeed } from "@/lib/seed";

export type ResolvedMedia = {
  media: MediaSeed;
  platform: string;
  label: string;
  href: string;
  embedUrl?: string;
  thumbUrl?: string;
  embeddable: boolean;
};

export function approvedMediaFor(experienceId: string, media: MediaSeed[]): ResolvedMedia[] {
  return media
    .filter((item) => item.experienceId === experienceId && item.state === "Approved")
    .map(resolveMedia);
}

export function resolveMedia(item: MediaSeed): ResolvedMedia {
  if (item.platform === "youtube") {
    const embedUrl = youtubeEmbedUrl(item.url);
    const thumbUrl = youtubeThumbUrl(item.url);
    if (embedUrl && thumbUrl) {
      return { media: item, platform: "YouTube", label: "Watch on YouTube", href: item.url, embedUrl, thumbUrl, embeddable: true };
    }
    return { media: item, platform: "YouTube", label: "Open on YouTube", href: item.url, embeddable: false };
  }
  return { media: item, platform: "Instagram", label: "Open on Instagram", href: item.url, embeddable: false };
}

/** Strict embeddable YouTube URL forms; anything else falls back to a plain link. */
export function youtubeEmbedUrl(url: string): string | undefined {
  const id = youTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : undefined;
}

export function youtubeThumbUrl(url: string): string | undefined {
  const id = youTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

function youTubeId(url: string): string | undefined {
  const watch = url.match(/^https:\/\/www\.youtube\.com\/watch\?v=([\w-]{6,})(&.*)?$/);
  if (watch) return watch[1];
  const short = url.match(/^https:\/\/youtu\.be\/([\w-]{6,})$/);
  if (short) return short[1];
  const shorts = url.match(/^https:\/\/www\.youtube\.com\/shorts\/([\w-]{6,})(&.*)?$/);
  return shorts ? shorts[1] : undefined;
}
