# Project Documentation

Start here when implementing the project.

## Product

- [PRD](01-product/PRD.md)
- [MVP Scope](01-product/MVP-SCOPE.md)
- [User Journeys](01-product/USER-JOURNEYS.md)

## Planning

- [Epics and Feature Map](02-planning/EPICS.md)
- [User Stories](02-planning/USER-STORIES.md)
- [Product Backlog](02-planning/PRODUCT-BACKLOG.md)
- [Sprint Plan](02-planning/SPRINT-PLAN.md)
- [Decision Log](02-planning/DECISION-LOG.md)

## Technical

Start with the one that is true:

- [Architecture, as it actually is](03-technical/ARCHITECTURE-ACTUAL.md)
- [Map and Routing](03-technical/MAP-AND-ROUTING.md)
- [Recommendation Design, as it actually is](03-technical/AI-RECOMMENDATION-DESIGN.md)
- [Project Tools and Plugin Registry](03-technical/PROJECT-TOOLS.md)

Archived, because they describe a system that was never built:

- [Architecture, proposed](99-archive/ARCHITECTURE-PROPOSED.md)
- [API Specification, proposed](99-archive/API-SPEC.md)
- [Data Model, proposed](99-archive/DATA-MODEL-PROPOSED.md)

## Data

- [Data Sources](04-data/DATA-SOURCES.md)
- [Event Ingestion](04-data/EVENT-INGESTION.md)
- [Verification Workflow](04-data/VERIFICATION-WORKFLOW.md)
- [Hidden Gem Policy](04-data/HIDDEN-GEM-POLICY.md)
- [External Media Policy](04-data/MEDIA-POLICY.md)

## Design and Quality

- [UX Flows](05-design/UX-FLOWS.md)
- [Design Contract](05-design/DESIGN-CONTRACT.md)
- [Content Style Guide](05-design/CONTENT-STYLE-GUIDE.md)
- [Accessibility](05-design/ACCESSIBILITY.md)
- [Privacy Policy Requirements](05-design/PRIVACY-POLICY-REQUIREMENTS.md)
- [Terms and Conditions Requirements](05-design/TERMS-AND-CONDITIONS-REQUIREMENTS.md)
- [Acceptance Criteria](06-quality/ACCEPTANCE-CRITERIA.md)
- [Test Plan](06-quality/TEST-PLAN.md)
- [Iterative Browser QA](06-quality/ITERATIVE-BROWSER-QA.md)
- [Demo Script](06-quality/DEMO-SCRIPT.md)
- [Definition of Done](06-quality/DEFINITION-OF-DONE.md)
- [Design Review Checklist](06-quality/DESIGN-REVIEW-CHECKLIST.md)

## Source of Context

The plan of record is [`../MASTERPLAN.md`](../MASTERPLAN.md), at the repository root.
The earlier [masterplan](99-archive/Local-Experiences-Masterplan.md) is archived. It is
kept as a record of what was considered, and it should not be cited as a claim
about the product.

## Deployment

The application is a static Next.js project and deploys to Vercel with no
configuration and no environment variables. `.env.example` lists the single
variable the map style URL can read, and leaving it empty is the supported setup.

**Do not deploy this publicly as it stands.** There is no authentication, and
`/admin/operations` and `/provider` mutate persistent state for anyone who loads
the page. This is a deliberate demo scope, recorded as DEC-020 in the
[decision log](02-planning/DECISION-LOG.md) and stated on both pages in the UI.
