# Definition of Done

This is the single definition of done for the project. Two other documents used
to carry their own version (`PRODUCT-BACKLOG.md` and `MVP-SCOPE.md`); those are
now cross-references to this file rather than parallel lists, because three
overlapping checklists is how a team ends up unable to say what "done" means.

A backlog item, a pull request, or a slice of the eval suite is Done only when
**all** of the following are true. There is no partial credit and no "done for
the demo".

## The eight gates

1. **It works in the product.** The change is reachable from a real route and
   does the thing the requirement describes, not a proxy of it.
2. **It is tested.** At least one automated test exercises it, and the test
   asserts a real value or a real behaviour, not merely that a function is
   defined. Every pure function gets at least one exact-value assertion.
3. **It typechecks and lints.** `npx tsc --noEmit` and `npm run lint` are clean
   for the files the change touches.
4. **Its claims are sourced or labelled.** Every number, price, hour, rating and
   availability shown to a traveller is either from a named source or explicitly
   marked as an estimate with its provenance. No value is invented to make a
   screen look populated. This is the truth contract.
5. **It has honest states.** Loading, empty, and error states exist, and the
   empty state says the honest thing ("nothing recorded yet") rather than
   implying success or hiding the gap.
6. **It degrades honestly.** If it depends on the network or on data that may not
   exist, it has a labelled fallback and the fallback says it is a fallback.
7. **It is accessible and responsive in the basics.** Keyboard reachable, has a
   label, works at 390 px and 1440 px, and honours the design contract.
8. **Its copy is clean.** No emoji, no em dash, no fabricated claim, no
   placeholder text, and legal and provenance links exist for anything a
   traveller can read.

## How each gate is checked

The machine-checkable version of this list is
[`ACCEPTANCE-CRITERIA.md`](ACCEPTANCE-CRITERIA.md), where every product criterion
carries a Status and an Enforced by column. CI runs the gates that can be
automated: typecheck, lint, test, build, and the eval report.

## What Done deliberately does not require

- A backend, a database, an API, or authentication. None of those exist in this
  product (DEC-020). An item is not incomplete for lacking them.
- A model, an embedding, or a reranker. None exist in the runtime (DEC-021). An
  item is not incomplete for being deterministic.
- A new runtime dependency. The dependency set is frozen and CI fails if it
  changes.
