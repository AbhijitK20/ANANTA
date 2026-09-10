"use client";

import { useEffect, useState } from "react";
import { readPlan } from "@/lib/plan";

/** Live count of drafted places, shown next to Trips in the navigation. */
export function PlanBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = () => setCount(readPlan().length);
    sync();
    window.addEventListener("ananta-plan-change", sync);
    return () => window.removeEventListener("ananta-plan-change", sync);
  }, []);
  if (count === 0) return null;
  return <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue px-1.5 text-[10px] font-bold leading-[18px] text-white">{count}</span>;
}
