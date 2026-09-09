# Sprint Plan

## Method

Use one-week sprints for the prototype, or two-week sprints for a larger team. Each sprint has one measurable goal and ends with a working reviewable increment.

### Workflow

```text
Backlog → Ready → In Progress → Review → Testing → Done
```

Limit each contributor to one primary item in progress. Move unfinished work back to the backlog rather than hiding it in the next sprint.

## Sprint 0: Scope and Setup

**Goal:** Agree on the product slice and establish the project.

**Deliverables:** Approved PRD, MVP scope, repository, environment setup, design baseline, initial schema, zone list, seed-data template, Definition of Done.

**Mandatory gate:** Approve the design contract, content style guide, media policy, accessibility rules, privacy requirements, Terms requirements, and design review checklist before production screen work.

**Exit criteria:** Team can run the application and load a sample record.

## Sprint 1: Map and Experience Data

**Goal:** Show curated Mumbai/Navi Mumbai experiences on a useful map.

**Backlog:** US-001, US-002, US-003, US-004.

**Deliverables:** MapLibre surface, zones, clustering, categories, seeded records, source metadata, experience detail shell.

**Exit criteria:** Traveler can select a zone, inspect a record, and see its source and freshness.

## Sprint 2: Search and Discovery

**Goal:** Let travelers find suitable experiences.

**Backlog:** US-005, US-006, US-007, US-010, US-011.

**Deliverables:** Search, filters, intent extraction, recommendation cards, positive and negative explanations.

**Exit criteria:** A request for local food and culture produces understandable results in the selected zone.

## Sprint 3: Feasible Planning

**Goal:** Turn a request into a valid plan.

**Backlog:** US-008, US-009, US-012, US-013, US-014, US-015.

**Deliverables:** Constraint engine, travel-time cache, deadline planning, budgets, itinerary, plan comparison.

**Exit criteria:** Seeded scenarios produce no hard-constraint violations.

## Sprint 4: Live Events and Adaptation

**Goal:** React to temporary events and changes.

**Backlog:** US-016, US-017, US-018, US-023, US-033.

**Deliverables:** Event model, `Happening Near Me`, expiry, rain/unavailable scenarios, alternatives, event-change flags.

**Exit criteria:** A changed condition produces a confirmed, validated replacement plan.

## Sprint 5: Provider and Admin Operations

**Goal:** Demonstrate the two-sided platform and data trust loop.

**Backlog:** US-019, US-020, US-021, US-022, US-024, US-032, US-035, US-037.

**Deliverables:** Provider submission, availability update, admin queue, hidden-gem review, report workflow, provider alerts.

**Exit criteria:** Provider or admin change affects the traveler-facing result.

## Sprint 6: Polish and Release

**Goal:** Make the demo reliable and presentable.

**Deliverables:** Responsive pass, accessibility basics, fallback states, test scenarios, seeded data cleanup, demo script, pitch visuals, architecture diagram.

**Exit criteria:** Full demo completes without manual database changes or paid-service dependency.

## Story Allocation Summary

| Sprint | Primary stories |
|---|---|
| Sprint 0 | Project setup, schema, seed format, delivery rules |
| Sprint 1 | US-001, US-002, US-003, US-004 |
| Sprint 2 | US-005, US-006, US-007, US-008, US-009 |
| Sprint 3 | US-010, US-011, US-012, US-013 |
| Sprint 4 | US-014, US-015, US-016, US-023 |
| Sprint 5 | US-017, US-018, US-019, US-020, US-021, US-022, US-024, US-032, US-035, US-037 |
| Sprint 6 | Regression, accessibility, fallback, media link checks, demo hardening |

## Ceremonies

- **Sprint planning:** Confirm one goal, capacity, dependencies, and acceptance criteria.
- **Daily sync:** What changed, what is blocked, what will be done next.
- **Backlog refinement:** Clarify the next sprint's stories and remove ambiguity.
- **Sprint review:** Demonstrate working software using the real demo scenario.
- **Retrospective:** Keep, stop, start; record one concrete improvement.

## Release Gate

Release only when the traveler journey, adaptation flow, event expiry, and admin correction flow pass the end-to-end checklist in `docs/06-quality/TEST-PLAN.md`.
