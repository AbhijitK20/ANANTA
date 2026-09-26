/**
 * Compatibility shim, not a second implementation.
 *
 * `app/trips/page.tsx` imports `applyTrigger` from
 * `@/components/ananta/replan`. Session 5 owns that page, and this round moved
 * every piece of the old file into `./replan/` under RULE 1. Rather than edit a
 * page another session owns, the old path re-exports the new namespace, so the
 * import keeps resolving and there is exactly one definition of each symbol.
 *
 * `ponytail:` delete this file when session 5 is next in that file, and change
 * its one import to `@/components/ananta/replan`.
 */
export * from "./replan/index";
export { replanWith as applyTrigger } from "./replan/replan-with";
