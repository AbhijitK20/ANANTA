import { ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import { typeScale } from "@/components/ananta/tokens";

/**
 * The sentence that tells a visitor what this surface is not.
 *
 * `/provider` and `/admin/operations` mutate persistent state with no
 * authentication, no authorization, no rate limiting and no CSRF token, and
 * there is no backend at all. For a device-local demo that is a legitimate
 * choice. Saying so is not optional, because a public deployment is a different
 * product and a visitor who assumes otherwise is being misled by the omission.
 *
 * Two facts belong on this notice and no more: there are no accounts, and
 * clearing site data erases everything. Anything longer would be a privacy
 * policy pretending to be a tooltip, and there is a real privacy page.
 */
export function LocalDemoNotice({
  variant = "provider",
  className = "",
}: {
  /** Which surface, so the sentence names what the buttons on it do. */
  variant?: "provider" | "admin" | "legal";
  className?: string;
}) {
  const consequence =
    variant === "admin"
      ? "Every button on this page writes to this browser. Anyone who loads it can press them, and there is no way to tell who did."
      : variant === "provider"
        ? "Everything you type is written to this browser, and anyone with this device can read or change it."
        : "This page describes a local application. Nothing you enter is transmitted.";

  return (
    <div className={`flex items-start gap-3 border border-line bg-canvas p-4 ${className}`}>
      <ShieldWarning size={18} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
      <div>
        <p className="text-sm font-bold text-ink">A local demo, with no accounts and no server</p>
        <p className={`mt-1 ${typeScale.body} text-muted`}>
          {consequence} Clearing this browser&apos;s site data erases everything on this page,
          permanently and with no recovery.
        </p>
      </div>
    </div>
  );
}
