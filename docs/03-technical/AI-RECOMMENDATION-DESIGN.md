# AI and Recommendation Design

## Principle

Use AI for understanding and explanation. Use deterministic code for operational truth and hard constraints.

## Pipeline

```text
Request
→ Intent Extraction
→ Constraint Normalization
→ Candidate Generation
→ Hard Constraint Filtering
→ Context Enrichment
→ Soft Scoring
→ Diversity Adjustment
→ Feasibility Validation
→ Explanation
```

## Hard Constraints

- Open at the relevant time
- Available for group size
- Within hard budget
- Fits activity, travel, waiting, and buffer time
- Meets accessibility requirements
- Meets deadline
- Within supported service area or valid route
- Suitable for age/group requirements

## Soft Signals

- Interest match
- Authenticity
- Local relevance
- Rating and review quality
- Recency
- Provider reliability
- Data confidence
- Distance and travel efficiency
- Weather suitability
- Diversity
- Hidden-gem candidate score

## Explainability

Every result stores structured explanation facts, for example:

```json
[
  "Matches local food preference",
  "Fits the 2-hour window",
  "12 minutes by taxi",
  "Within ₹1,500 budget",
  "Provider availability verified today"
]
```

## Fallback

If an LLM is unavailable:

- Use keyword and tag matching.
- Use structured filters.
- Use deterministic ranking.
- Show a standard explanation template.

## Evaluation Scenarios

- Hard budget must never be exceeded.
- Closed experiences must not be recommended.
- A plan must not miss a train deadline.
- Rain should reduce outdoor suitability.
- Family input should affect age and accessibility ranking.
- Low popularity alone must not create a hidden-gem label.
