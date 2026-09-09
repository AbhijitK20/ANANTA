"use client";

import { useEffect, useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { readPlan, writePlan } from "@/lib/plan";

export function AddToPlanButton({ experienceId }: { experienceId: string }) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    const sync = () => setAdded(readPlan().includes(experienceId));
    sync();
    window.addEventListener("local-tourist-plan-change", sync);
    return () => window.removeEventListener("local-tourist-plan-change", sync);
  }, [experienceId]);
  return <button onClick={() => { const ids = readPlan(); writePlan(added ? ids.filter((id) => id !== experienceId) : [...ids, experienceId]); setAdded(!added); }} className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold ${added ? "bg-greenSoft text-green" : "bg-blue text-white hover:bg-[#1249ad]"}`}>{added && <Check size={17} weight="bold" />}{added ? "Added to plan" : "Add to plan"}</button>;
}
