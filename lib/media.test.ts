import { describe, expect, it } from "vitest";
import { approvedMediaFor, youtubeEmbedUrl, youtubeThumbUrl } from "@/lib/media";
import { mediaSeed } from "@/lib/seed";

describe("approvedMediaFor", () => {
  it("returns only approved records for the experience", () => {
    const media = approvedMediaFor("kala-ghoda-art-walk", mediaSeed);
    expect(media).toHaveLength(1);
    expect(media[0].media.id).toBe("media-kala-ghoda");
    expect(media[0].embeddable).toBe(true);
  });

  it("excludes archived media from discovery", () => {
    expect(approvedMediaFor("girgaon-chowpatty-snack-trail", mediaSeed)).toHaveLength(0);
  });

  it("holds needs-review media out of the traveler view", () => {
    expect(approvedMediaFor("juhu-beach-morning-walk", mediaSeed)).toHaveLength(0);
  });

  it("falls back to a platform link when embedding is not permitted", () => {
    const media = approvedMediaFor("vashi-market-loop", mediaSeed);
    expect(media[0].embeddable).toBe(false);
    expect(media[0].label).toBe("Open on Instagram");
    expect(media[0].href).toContain("instagram.com");
  });

  it("every approved YouTube record resolves to an embed and a thumbnail", () => {
    for (const item of mediaSeed) {
      if (item.platform !== "youtube" || item.state !== "Approved") continue;
      expect(youtubeEmbedUrl(item.url), item.id).toMatch(/^https:\/\/www\.youtube\.com\/embed\/[\w-]{11}$/);
      expect(youtubeThumbUrl(item.url), item.id).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/);
      expect(item.title.length, item.id).toBeGreaterThan(5);
      expect(item.creator.length, item.id).toBeGreaterThan(2);
      expect(item.note.length, item.id).toBeGreaterThan(10);
    }
  });

  it("gives a dozen real approved videos across the city", () => {
    const approved = mediaSeed.filter((item) => item.state === "Approved" && item.platform === "youtube");
    expect(approved.length).toBe(12);
  });
});

describe("youtube url parsing", () => {
  it("parses watch URLs", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ")).toBe("https://www.youtube.com/embed/aqz-KE-bpKQ");
    expect(youtubeThumbUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ")).toBe("https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg");
  });

  it("parses share and shorts URLs", () => {
    expect(youtubeEmbedUrl("https://youtu.be/9bZkp7q19f0")).toBe("https://www.youtube.com/embed/9bZkp7q19f0");
    expect(youtubeEmbedUrl("https://www.youtube.com/shorts/aqz-KE-bpKQ")).toBe("https://www.youtube.com/embed/aqz-KE-bpKQ");
  });

  it("rejects URLs that are not a known embeddable form", () => {
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=abc")).toBeUndefined();
    expect(youtubeEmbedUrl("https://youtube.com/watch?v=aqz-KE-bpKQ")).toBeUndefined();
    expect(youtubeThumbUrl("https://example.com/video")).toBeUndefined();
  });
});
