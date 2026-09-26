import { EventsSkeleton } from "@/components/events/skeleton";

/**
 * The loading boundary for `/events`.
 *
 * ponytail: the feed is evaluated from a frozen seed in the browser, so this is
 * the route transition state and not a data wait. It is a real boundary rather
 * than a decorative one because the moment anything on this route awaits, the
 * same placeholders are what stands in for it, at the card proportions rather
 * than a generic stripe.
 */
export default function Loading() {
  return <EventsSkeleton />;
}
