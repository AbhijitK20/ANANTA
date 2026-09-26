import { HomeSkeleton } from "@/components/home/skeleton";

/**
 * The loading boundary for `/`.
 *
 * `app/loading.tsx` wraps the root segment, which is the landing and nothing
 * else, so this file is the landing's loading state and no other route's. The
 * shape lives in `components/home/skeleton.tsx` because a route file is the wrong
 * place to keep a hundred lines of markup.
 *
 * ponytail: the landing reads a frozen seed synchronously, so this is the route
 * transition state rather than a data wait. It becomes a real data skeleton the
 * moment anything on the route awaits, and the placeholder proportions are the
 * card proportions so it will not shift when that happens.
 */
export default function Loading() {
  return <HomeSkeleton />;
}
