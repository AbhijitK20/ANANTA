/**
 * Text normalisation for the retrieval stage.
 *
 * Local to this stage on purpose. `lib/data/factory.ts` has a `tokenize` for
 * build-time video assignment; it filters on length 3 and drops city names, so
 * it is the wrong tool for search. Two tokenizers with two jobs is correct.
 *
 * Everything here is pure and deterministic: no clock, no randomness, no
 * dictionary lookups, and every table below is a literal.
 */

/**
 * The single token every run of Devanagari script collapses to.
 *
 * Ten rows in `lib/data/geocoded.generated.ts` came back from OSM with a
 * Devanagari `match` value, so a reviewer cannot read them and no Latin query
 * can reach them. Transliterating properly needs a mapping table we do not
 * have. Collapsing the script to one class makes those rows findable by class,
 * which keeps the anomaly visible in search results instead of hiding it
 * behind an unsearchable row. See `SESSION/BLOCKERS/2.md`.
 */
export const DEVANAGARI_TOKEN = "devanagari";

/** U+0900 to U+097F, the Devanagari block. Written as an explicit range rather
 * than `\p{Script=Devanagari}`, because the repository compiles to es5 where the
 * `u` flag and the property escapes are not available. */
const DEVANAGARI_RUN = /[\u0900-\u097F]+/g;

/**
 * Any run of two or more non-ASCII characters. Latin-1 punctuation (curly
 * quotes, dashes) is single or double characters too, so the run length floor
 * keeps a lone em dash from being reported as a script.
 */
const OTHER_SCRIPT_RUN = /[^\x00-\x7f]{2,}/g;

/** Cheap guard so an all Latin string pays for one regex scan, not four. */
const NON_ASCII = /[^\x00-\x7f]/;

const NOT_FOLDABLE = /[^a-z0-9]+/g;

/**
 * Lowercase a string into its comparable form: ASCII letters and digits kept,
 * every other character collapsed to a single space, and each run of non-Latin
 * script replaced by one token naming the class. Two strings that read the same
 * fold to the same string, which is what the phrase boost and the facet
 * comparison both rely on.
 */
export function foldForMatch(text: string): string {
  const lowered = text.toLowerCase();
  if (NON_ASCII.test(lowered)) {
    return lowered
      .replace(DEVANAGARI_RUN, ` ${DEVANAGARI_TOKEN} `)
      .replace(OTHER_SCRIPT_RUN, " nonlatin ")
      .replace(NOT_FOLDABLE, " ")
      .trim();
  }
  return lowered.replace(NOT_FOLDABLE, " ").trim();
}

/**
 * Function words and prepositions only. No place names and no city names: a
 * stopword that names a place makes that place unsearchable, and the city
 * vocabulary of a city lives in `CityManifest`, not here.
 */
const STOPWORDS = new Set([
  "a", "about", "above", "across", "after", "again", "against", "all", "along", "also", "among",
  "am", "an", "and", "another", "any", "anyone", "anything", "are", "around", "as", "at",
  "back", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing", "done", "down", "during", "each", "else", "end",
  "enough", "even", "ever", "every", "few", "for", "from", "further", "had", "has", "have",
  "having", "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in", "inside", "into",
  "is", "it", "its", "just", "me", "might", "mine", "more", "most", "much", "must", "my",
  "myself", "near", "nearby", "neither", "no", "nor", "not", "now", "of", "off", "on", "once",
  "one", "only", "onto", "or", "other", "others", "our", "ours", "out", "outside", "over", "own",
  "per", "same", "shall", "she", "should", "since", "so", "some", "someone", "something", "still",
  "such", "than", "that", "the", "their", "theirs", "them", "then", "there", "these", "they",
  "this", "those", "through", "till", "to", "too", "toward", "towards", "under", "unless", "until",
  "up", "upon", "us", "very", "via", "was", "we", "were", "what", "when", "where", "which",
  "while", "who", "whom", "whose", "why", "will", "with", "within", "without", "would", "you",
  "your", "yours",
]);

/** Longest suffix a stemmer may remove, so a 2 character token is never
 * reduced to nothing by accident. */
const MIN_STEM_LENGTH = 4;

/**
 * Conservative singulariser. Four rules, each guarded so it cannot shorten a
 * token past usefulness or strip a suffix that belongs to the word itself.
 *
 *   `ies` -> `y`      galleries -> gallery
 *   `(ch|sh|ss|x|z)es` -> ``  classes -> class, boxes -> box, watches -> watch
 *   `ing` -> ``       learning -> learn, swimming -> swim
 *   `ed`  -> ``       visited -> visit, walked -> walk
 *   `s`   -> ``       forts -> fort, ghats -> ghat, cafes -> cafe
 *
 * What it deliberately does not do: it does not strip a bare `e` ("cafe" stays
 * "cafe"), it leaves `ss`, `us` and `is` endings alone (glass, villas, oasis),
 * it refuses `ed` when the remainder ends in `s` (so `closed` and `based` are
 * not folded onto `clos` and `bas`), and it never removes a suffix that would
 * leave fewer than four characters.
 *
 * ponytail: a lone `ses` ending collapses by the final rule, so `classes` stems
 * to `classe`, not `class`, and a `seri` ending such as `series` stems to
 * `sery`. Neither word appears in a place catalogue. Upgrade path: build the
 * stem table from the corpus itself, counting real token pairs, and drop any
 * rule whose output never occurs in the index.
 */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length >= 5 && endsWithSibilant(token)) return token.slice(0, -2);
  if (token.length >= 6 && token.endsWith("ing")) return deDouble(token.slice(0, -3));
  if (token.length >= 5 && token.endsWith("ed")) {
    const rest = token.slice(0, -2);
    return rest.length >= 4 && !rest.endsWith("s") ? deDouble(rest) : token;
  }
  if (token.length >= 4 && token.endsWith("s") && !endsWithSibilantLetters(token)) return token.slice(0, -1);
  return token;
}

/** `ches`, `shes`, `sses`, `xes`, `zes`: the plural of a word ending in a
 * sibilant sound keeps the sound, so only `es` comes off. */
function endsWithSibilant(token: string): boolean {
  return (
    token.endsWith("ches") ||
    token.endsWith("shes") ||
    token.endsWith("sses") ||
    token.endsWith("xes") ||
    token.endsWith("zes")
  );
}

/** `glass`, `villas`, `oasis`: the `s` is part of the word, not a plural marker. */
function endsWithSibilantLetters(token: string): boolean {
  return token.endsWith("ss") || token.endsWith("us") || token.endsWith("is");
}

/** `swimming` -> `swim`, `sitting` -> `sit`. Leaves a single consonant alone. */
function deDouble(rest: string): string {
  const last = rest.charAt(rest.length - 1);
  return rest.length >= MIN_STEM_LENGTH && last === rest.charAt(rest.length - 2) ? rest.slice(0, -1) : rest;
}

/**
 * Lowercase, split on every non-alphanumeric character, drop stopwords and
 * one-character tokens, then stem what is left. Order is preserved and
 * duplicates are kept, because a term repeated in a description is a signal.
 */
export function tokenize(text: string): string[] {
  const folded = foldForMatch(text);
  if (folded.length === 0) return [];
  const out: string[] = [];
  for (const raw of folded.split(" ")) {
    if (raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

/** Distinct tokens, sorted, so a query is scored in a fixed order. */
export function uniqueTokens(tokens: readonly string[]): string[] {
  return Array.from(new Set(tokens)).sort();
}
