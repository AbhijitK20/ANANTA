import type { ComponentId, Confidence, ScoreComponent } from "@/lib/engine";
import { KNOWLEDGE_DEPTH, depth } from "@/components/ananta/tokens";

/**
 * Depth for the explanation layer, in one file, because it is one rule.
 *
 * THE RULE: depth encodes what we know, never how large a number is.
 *
 * The temptation in this component is to make the biggest contributor stand
 * proud, by encoding `contribution` as `translateZ`. Do not. Perspective
 * projection changes apparent size, so a mark stops being readable as a quantity
 * and becomes ambiguous between "small value" and "far away". The CHI 2026 D-MO
 * work puts the cost plainly: introducing depth as a visual channel "comes at
 * the cost of ambiguity in size which is one of the few visual channels effective
 * at conveying quantity". Munzner's taxonomy ranks depth below 2D size for exactly
 * this reason and discourages it for data that is not inherently three
 * dimensional. A contribution score is a scalar. It is not inherently three
 * dimensional.
 *
 * So magnitude is bar length and a printed number, both of which survive
 * reduced motion and both of which a screen reader reaches. Depth on this
 * component is reserved for epistemic status, which is the one thing it is good
 * at: a row resting on a fact we could not confirm is carved into the surface,
 * and a row resting on confirmed facts stands proud of it.
 */

/**
 * What a score row is when the caller does not say otherwise.
 *
 * `estimate` is the honest default and not a shrug. A score component *is* our
 * arithmetic laid over the top of whatever facts the record has, which is
 * verbatim what `estimate` means in the knowledge grammar, and it maps to
 * `depth-flush`: sitting on the surface, neither proud nor carved. A caller that
 * knows more, because it holds the record and can see which field fed a row,
 * passes it and the row moves.
 */
export const DEFAULT_ROW_CONFIDENCE: Confidence = "estimate";

/**
 * The depth for one score row.
 *
 * A **negative contribution is always flush**, whatever its confidence. A penalty
 * is a real computed result, the plan is genuinely worse for it, and recessing it
 * would say "we do not know", which is a different claim and a wrong one. The
 * number is already signed and already amber in the text; the depth has nothing
 * left to add and would only mislead.
 */
export const rowDepth = (
  item: Pick<ScoreComponent, "id" | "contribution">,
  confidence: Confidence = DEFAULT_ROW_CONFIDENCE,
): string => (item.contribution < 0 ? depth.flush : KNOWLEDGE_DEPTH[confidence]);

/** Recessed rows also desaturate, so the state is never carried by depth alone. */
export const rowRecessed = (
  item: Pick<ScoreComponent, "id" | "contribution">,
  confidence: Confidence = DEFAULT_ROW_CONFIDENCE,
): boolean => item.contribution >= 0 && confidence === "unverified";

/**
 * The sentence a recessed row carries, because depth is a redundant channel and
 * the words are the primary one. It names the state and stops there: the specific
 * missing field belongs to the caller that knows it.
 */
export const UNVERIFIED_ROW_NOTE = "Rests on a fact we could not confirm, so this row is set into the card.";

/** Read a caller's optional map without inventing a key. */
export const confidenceFor = (
  item: Pick<ScoreComponent, "id">,
  byComponent: Partial<Record<ComponentId, Confidence>> | undefined,
): Confidence => byComponent?.[item.id as ComponentId] ?? DEFAULT_ROW_CONFIDENCE;
