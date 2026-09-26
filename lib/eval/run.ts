/**
 * `npm run eval`. Prints the section 9 success table and exits non-zero when a
 * target is missed, so CI fails on a regression instead of on a judgement call.
 *
 * The report goes to stdout, not a file. A measurement that only exists in
 * `eval-report.txt` is a measurement nobody reads.
 */
import { formatReport, runEval, targetsMet } from "./metrics";

const run = runEval();
console.log(formatReport(run));

const verdict = targetsMet(run);
if (verdict.met) {
  console.log("\nAll section 9 targets hold.");
  process.exitCode = 0;
} else {
  console.error("\nTargets missed:");
  for (const failure of verdict.failures) console.error("  " + failure);
  process.exitCode = 1;
}
