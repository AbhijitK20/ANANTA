export type DiscoveryIntent = {
  text: string;
  category?: string;
  city?: "Mumbai" | "Navi Mumbai";
  maxPrice?: number;
  availableMinutes?: number;
  weather?: "rain";
};

const CATEGORY_KEYWORDS = ["food", "culture", "shopping", "nature", "workshop", "family", "nightlife", "adventure", "recreation", "stay"] as const;

/** Lowercase search words map onto the dataset's canonical category names. */
const CANONICAL_CATEGORIES: Record<string, string> = {
  food: "Food",
  culture: "Culture",
  shopping: "Shopping",
  nature: "Nature",
  workshop: "Workshop",
  family: "Family",
  nightlife: "Nightlife",
  adventure: "Adventure",
  recreation: "Recreation",
  stay: "Stay",
};

/** Synonyms that map search words onto dataset categories. */
const categoryAliases: Record<string, string> = {
  hotel: "Stay",
  hotels: "Stay",
  restaurant: "Food",
  restaurants: "Food",
  trek: "Adventure",
  trekking: "Adventure",
};

export function parseDiscoveryIntent(text: string): DiscoveryIntent {
  const normalized = text.toLowerCase();
  const alias = Object.keys(categoryAliases).find((value) => new RegExp(`\\b${value}\\b`).test(normalized));
  const matched = CATEGORY_KEYWORDS.find((value) => normalized.includes(value));
  const category = alias ? categoryAliases[alias] : matched ? CANONICAL_CATEGORIES[matched] : undefined;
  const priceMatch = normalized.match(/(?:under|below|budget(?: of)?|₹)\s*₹?\s*([0-9,]+)/);
  const hourMatch = normalized.match(/([0-9.]+)\s*hours?/);
  const minuteMatch = normalized.match(/([0-9]+)\s*minutes?/);
  const city = normalized.includes("navi mumbai") || normalized.includes("vashi") || normalized.includes("kharghar") ? "Navi Mumbai" : normalized.includes("mumbai") || normalized.includes("cst") || normalized.includes("churchgate") || normalized.includes("matunga") ? "Mumbai" : undefined;
  return {
    text,
    category,
    city,
    maxPrice: priceMatch ? Number(priceMatch[1].replaceAll(",", "")) : undefined,
    availableMinutes: hourMatch ? Number(hourMatch[1]) * 60 : minuteMatch ? Number(minuteMatch[1]) : undefined,
    weather: normalized.includes("rain") || normalized.includes("monsoon") ? "rain" : undefined,
  };
}

export function discoveryUrl(text: string) {
  return `/explore?q=${encodeURIComponent(text)}`;
}
