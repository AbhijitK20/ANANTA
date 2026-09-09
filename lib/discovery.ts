export type DiscoveryIntent = {
  text: string;
  category?: string;
  city?: "Mumbai" | "Navi Mumbai";
  maxPrice?: number;
  availableMinutes?: number;
  weather?: "rain";
};

const categories = ["food", "culture", "shopping", "nature", "workshop", "family"];

export function parseDiscoveryIntent(text: string): DiscoveryIntent {
  const normalized = text.toLowerCase();
  const category = categories.find((value) => normalized.includes(value));
  const priceMatch = normalized.match(/(?:under|below|budget(?: of)?|₹)\s*₹?\s*([0-9,]+)/);
  const hourMatch = normalized.match(/([0-9.]+)\s*hours?/);
  const minuteMatch = normalized.match(/([0-9]+)\s*minutes?/);
  const city = normalized.includes("navi mumbai") || normalized.includes("vashi") || normalized.includes("kharghar") ? "Navi Mumbai" : normalized.includes("mumbai") || normalized.includes("cst") || normalized.includes("churchgate") || normalized.includes("matunga") ? "Mumbai" : undefined;
  return {
    text,
    category: category ? category[0].toUpperCase() + category.slice(1) : undefined,
    city,
    maxPrice: priceMatch ? Number(priceMatch[1].replaceAll(",", "")) : undefined,
    availableMinutes: hourMatch ? Number(hourMatch[1]) * 60 : minuteMatch ? Number(minuteMatch[1]) : undefined,
    weather: normalized.includes("rain") || normalized.includes("monsoon") ? "rain" : undefined,
  };
}

export function discoveryUrl(text: string) {
  return `/explore?q=${encodeURIComponent(text)}`;
}
