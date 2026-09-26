import { BottomNav } from "@/components/ui";
import { Footer } from "@/components/footer";

/**
 * The landing's loading state, mounted by `app/loading.tsx`.
 *
 * It matches the real page section for section and at the same heights, so
 * nothing jumps when the content lands. The bar placeholders are the same width
 * as the text they stand in for rather than a uniform 100 percent stripe, because
 * a skeleton that is the wrong shape is a layout shift with extra steps.
 *
 * `animate-pulse` animates opacity and nothing else, so it is inside the spatial
 * contract, and the blanket rule in the global reduced-motion block collapses
 * every animation duration to 0.01ms, so it stops moving for a visitor who asked
 * for that. No second `@keyframes` is added: this is a Tailwind utility and the
 * one keyframe block in the stylesheet stays the route dot.
 *
 * The chrome is real, not a placeholder, because the header, footer, and bottom
 * nav are already in the document when the route streams. Rendering them here too
 * means the page does not lose its frame on the way in.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-chip bg-line ${className}`} />;
}

export function HomeSkeleton() {
  return (
    <main id="main-content" className="min-h-screen bg-canvas" aria-busy="true">
      <p role="status" className="sr-only">
        Loading the home page
      </p>

      <div className="mx-auto min-h-screen max-w-[1480px] bg-surface lg:my-5 lg:min-h-[calc(100vh-40px)] lg:rounded-shell lg:shadow-card">
        <div aria-hidden="true" className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-card bg-line" />
            <Bar className="h-4 w-20" />
          </div>
          <Bar className="h-9 w-24" />
        </div>

        <div aria-hidden="true" className="border-b border-line bg-canvas px-5 py-12 sm:px-8 lg:px-14 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
            <div>
              <Bar className="h-6 w-56" />
              <div className="mt-5 space-y-3">
                <Bar className="h-9 w-full max-w-[560px]" />
                <Bar className="h-9 w-4/5 max-w-[420px]" />
              </div>
              <div className="mt-5 space-y-2">
                <Bar className="h-4 w-full max-w-[520px]" />
                <Bar className="h-4 w-3/4 max-w-[380px]" />
              </div>
              <div className="mt-8 flex h-[60px] items-center gap-2 rounded-card border border-line bg-surface p-2">
                <Bar className="h-6 w-6 rounded-full" />
                <Bar className="h-4 flex-1" />
                <div className="h-11 w-11 animate-pulse rounded-card bg-line" />
              </div>
              <div className="mt-3 flex gap-2">
                {["w-24", "w-32", "w-24", "w-20"].map((width) => (
                  <Bar key={width} className={`h-7 ${width}`} />
                ))}
              </div>
              <div className="mt-7 h-12 w-40 animate-pulse rounded bg-line" />
            </div>
            <div className="depth-raised card h-fit p-5 lg:p-6">
              <Bar className="h-3 w-40" />
              <div className="mt-3 space-y-2">
                <Bar className="h-4 w-full" />
                <Bar className="h-4 w-5/6" />
              </div>
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <Bar className="h-3 w-full" />
                <Bar className="h-3 w-4/5" />
                <Bar className="h-3 w-3/4" />
              </div>
            </div>
          </div>
        </div>

        {[3, 4].map((columns) => (
          <div key={columns} aria-hidden="true" className="px-5 py-10 sm:px-8 lg:px-14 lg:py-12">
            <Bar className="h-3 w-32" />
            <Bar className="mt-3 h-6 w-56" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: columns }, (_card, index) => (
                <div key={index} className="overflow-hidden rounded-card border border-line bg-surface">
                  <div className="aspect-[3/2] animate-pulse bg-line" />
                  <div className="space-y-2 p-4">
                    <Bar className="h-3 w-20" />
                    <Bar className="h-4 w-4/5" />
                    <Bar className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Footer />
      <BottomNav />
    </main>
  );
}
