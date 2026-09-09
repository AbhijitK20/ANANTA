# API Specification

## Conventions

- JSON over HTTPS.
- ISO 8601 timestamps in UTC.
- Currency amounts represented as integer minor units or explicit decimal amounts.
- Errors use stable codes and human-readable messages.
- Pagination is required for list endpoints.

## Traveler APIs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/experiences` | Search and filter experiences |
| `GET` | `/api/v1/experiences/:id` | Get experience details |
| `GET` | `/api/v1/events` | Search active events |
| `POST` | `/api/v1/intent/parse` | Convert natural language to constraints |
| `POST` | `/api/v1/recommendations` | Rank candidates for a context |
| `POST` | `/api/v1/plans` | Generate a plan |
| `POST` | `/api/v1/plans/:id/recalculate` | Recalculate after a change |
| `POST` | `/api/v1/plans/:id/compare` | Generate plan variants |
| `POST` | `/api/v1/reports` | Report incorrect data |
| `GET` | `/api/v1/experiences/:id/media` | Get active approved media |

## Provider APIs

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/provider/experiences` | Submit experience |
| `PATCH` | `/api/v1/provider/experiences/:id` | Edit experience |
| `PUT` | `/api/v1/provider/experiences/:id/availability` | Update slots/capacity |
| `GET` | `/api/v1/provider/bookings` | View bookings |
| `GET` | `/api/v1/provider/analytics` | View basic demand metrics |

## Admin APIs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/queue` | Review data operations |
| `POST` | `/api/v1/admin/records/:id/verify` | Verify a record |
| `POST` | `/api/v1/admin/records/:id/reject` | Reject or request changes |
| `POST` | `/api/v1/admin/records/:id/archive` | Archive stale/invalid data |
| `POST` | `/api/v1/admin/events/:id/recheck` | Recheck an event source |
| `POST` | `/api/v1/admin/media/:id/verify` | Approve or reject media |
| `POST` | `/api/v1/admin/media/:id/archive` | Archive unavailable or stale media |
| `POST` | `/api/v1/media/report` | Report broken or misleading media |

## Recommendation Response Shape

```json
{
  "plan_id": "plan_123",
  "confidence": 0.92,
  "total_cost": 1500,
  "total_minutes": 210,
  "items": [],
  "warnings": [],
  "explanations": [],
  "excluded_candidates": []
}
```

## Error Codes

- `INVALID_CONSTRAINTS`
- `NO_FEASIBLE_PLAN`
- `AVAILABILITY_UNCONFIRMED`
- `ROUTE_UNAVAILABLE`
- `SOURCE_STALE`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `RATE_LIMITED`
