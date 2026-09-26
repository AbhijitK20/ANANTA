import { Notice } from "@/components/workspace/notice";

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
 *
 * It used to be an amber border with a shield glyph, which read as a security
 * warning about a threat that does not exist here. There is no threat model on a
 * device that already holds the only copy of the data. What there is, is a scope
 * note, and `Notice` is what a scope note looks like.
 */
export function LocalDemoNotice({
  variant = "provider",
  className = "",
}: {
  /** Which surface, so the sentence names what the buttons on it do. */
  variant?: "provider" | "admin";
  className?: string;
}) {
  const consequence =
    variant === "admin"
      ? "Every button on this page writes to this browser. Anyone who loads it can press them, and there is no way to tell who did."
      : "Everything you type is written to this browser, and anyone with this device can read or change it.";

  return (
    <Notice title="A local demo, with no accounts and no server" className={className}>
      <p>
        {consequence} Clearing this browser&apos;s site data erases everything on this page,
        permanently and with no recovery.
      </p>
    </Notice>
  );
}
