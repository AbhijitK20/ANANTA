export type ProviderListing = {
  id: string;
  name: string;
  area: string;
  category: string;
  status: "Published" | "Under review";
  availability: "Open" | "Limited" | "Closed";
  updated: string;
  updatedAt: string;
};

export const providerListingSeed: ProviderListing[] = [
  { id: "matunga-breakfast-trail", name: "Matunga Breakfast Trail", area: "Matunga", category: "Food", status: "Published", availability: "Open", updated: "Today", updatedAt: "2026-09-09" },
  { id: "vashi-market-loop", name: "Vashi Market Loop", area: "Vashi", category: "Shopping", status: "Published", availability: "Limited", updated: "Yesterday", updatedAt: "2026-09-08" },
];

export const PROVIDER_LISTINGS_KEY = "ananta-provider-listings";
export const PROVIDER_OPERATIONS_KEY = "ananta-provider-operations";

export function readProviderListings() {
  if (typeof window === "undefined") return providerListingSeed;
  try {
    const value = JSON.parse(window.localStorage.getItem(PROVIDER_LISTINGS_KEY) || "null");
    return Array.isArray(value) ? value as ProviderListing[] : providerListingSeed;
  } catch {
    return providerListingSeed;
  }
}

export function writeProviderListings(listings: ProviderListing[]) {
  window.localStorage.setItem(PROVIDER_LISTINGS_KEY, JSON.stringify(listings));
  window.dispatchEvent(new Event("ananta-provider-change"));
}

export function providerAvailability(listings: ProviderListing[]) {
  return Object.fromEntries(listings.map((listing) => [listing.id, listing.availability])) as Record<string, ProviderListing["availability"]>;
}

export function providerUpdatedDates(listings: ProviderListing[]) {
  return Object.fromEntries(listings.map((listing) => [listing.id, listing.updatedAt]));
}
