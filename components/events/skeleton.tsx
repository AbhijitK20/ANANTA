import { BottomNav } from "@/components/ui";
import { Footer } from "@/components/footer";

/**
 * The events feed's loading state, mounted by `app/events/loading.tsx`.
 *
 * Same skeleton rules as the landing: opacity only, no second `@keyframes`, and
 * placeholder heights that match the real card so the column does not jump. The
 * rail is stubbed too, because a feed that arrives as a plain list reads as a
 * different page rather than the same one a moment later.
 *
 * The controls are stubbed as one search bar and one segmented group, which is
 * what the page renders at rest, so the two line up.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-chip bg-line ${className}`} />;
}

export function EventsSkeleton() {
  return (
    <main id="main-content" className="min-h-screen bg-canvas" aria-busy="true">
      <p role="status" className="sr-only">
        Loading events
      </p>

      <div className="mx-auto min-h-screen max-w-[1180px] bg-surface lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-shell lg:shadow-card">
        <div
          aria-hidden="true"
          className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8"
        >
          <Bar className="h-4 w-16" />
          <Bar className="h-5 w-40" />
          <Bar className="h-4 w-24" />
        </div>

        <div aria-hidden="true" className="px-5 pb-28 pt-10 sm:px-8 lg:px-14 lg:pb-14">
          <Bar className="h-3 w-48" />
          <div className="mt-4 space-y-2">
            <Bar className="h-8 w-full max-w-[520px]" />
            <Bar className="h-8 w-2/3 max-w-[340px]" />
          </div>
          <div className="mt-4 space-y-2">
            <Bar className="h-3 w-full max-w-[640px]" />
            <Bar className="h-3 w-4/5 max-w-[520px]" />
          </div>

          <div className="mt-8 rounded-card border border-line bg-canvas p-4">
            <div className="flex h-11 items-center gap-2 rounded-input border border-line bg-surface px-3">
              <div className="h-5 w-5 animate-pulse rounded-full bg-line" />
              <Bar className="h-4 flex-1" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Bar className="h-3 w-28" />
              <div className="flex gap-1 rounded-input border border-line bg-surface p-1">
                {["w-14", "w-20", "w-20", "w-20"].map((width) => (
                  <Bar key={width} className={`h-10 ${width} rounded-chip`} />
                ))}
              </div>
            </div>
            <Bar className="mt-3 h-3 w-72" />
          </div>

          <Bar className="mt-8 h-3 w-80" />

          <ol className="mt-4 space-y-4">
            {[0, 1, 2].map((row) => (
              <li key={row} className="flex gap-4">
                <div className="flex w-4 shrink-0 flex-col items-center">
                  <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-line" />
                  {row < 2 && <span className="w-0.5 flex-1 bg-line" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col border border-line bg-surface sm:flex-row">
                  <div className="h-36 shrink-0 animate-pulse bg-line sm:h-auto sm:w-44" />
                  <div className="min-w-0 flex-1 space-y-3 p-4">
                    <div className="flex gap-2">
                      <Bar className="h-5 w-32 rounded-chip" />
                      <Bar className="h-5 w-20 rounded-chip" />
                    </div>
                    <Bar className="h-6 w-3/5" />
                    <Bar className="h-3 w-2/5" />
                    <div className="flex gap-4">
                      <Bar className="h-3 w-24" />
                      <Bar className="h-3 w-28" />
                      <Bar className="h-3 w-24" />
                    </div>
                    <Bar className="h-3 w-full" />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Footer />
      <BottomNav />
    </main>
  );
}
