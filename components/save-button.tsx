"use client";

import { useEffect, useState } from "react";
import { BookmarkSimple, BookmarkSimple as BookmarkFilled } from "@phosphor-icons/react/dist/ssr";
import { readSaved, writeSaved } from "@/lib/saved";

export function SaveButton({ experienceId }: { experienceId: string }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const sync = () => setSaved(readSaved().includes(experienceId));
    sync();
    window.addEventListener("local-tourist-saved-change", sync);
    return () => window.removeEventListener("local-tourist-saved-change", sync);
  }, [experienceId]);
  return <button onClick={() => { const ids = readSaved(); writeSaved(saved ? ids.filter((id) => id !== experienceId) : [...ids, experienceId]); setSaved(!saved); }} aria-label={saved ? "Remove from saved" : "Save experience"} className={`rounded-lg border p-2.5 ${saved ? "border-blue bg-blueSoft text-blue" : "border-line text-ink"}`}>{saved ? <BookmarkFilled size={20} weight="fill" /> : <BookmarkSimple size={20} />}</button>;
}
