import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  REJECTION_CODES,
  REJECTION_UNIT_LABEL,
  REJECTION_UNIT_SUFFIX,
  rejectionSentence,
} from "./codes";
import type { ProvenancedField, RejectionCode, RejectionUnit } from "./types";
import {
  ACCESS_NEEDS,
  COMPONENT_IDS,
  DIET_NEEDS,
  PROVENANCE_VALUES,
  REJECTION_CODES_LIST,
} from "./types";

const BANNED_PHRASES = ["constraint violated", "not eligible", "unavailable"];
/** No `u` flag: tsconfig targets es5, and a surrogate pair is matched directly. */
const EMOJI = /[\u2600-\u27BF\uFE0F\u2190-\u21FF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
/** Built from its code point so the source file holds no em dash character. */
const EM_DASH = String.fromCharCode(0x2014);

/**
 * The named fact each sentence must carry when it has no number to quote. A
 * rejection that says neither is a rejection nobody can act on.
 */
const NAMED_FACT: Record<RejectionCode, string> = {
  too_far: "travel window",
  travel_time_exceeds_budget: "Travel time",
  duration_exceeds_budget: "visit",
  closed_now: "Closed",
  closed_during_window: "Closed",
  hours_unverified: "unverified",
  over_budget: "budgeted",
  over_budget_per_person: "per person",
  capacity_exceeded: "Seats",
  not_step_free: "step-free",
  not_stroller_ok: "stroller",
  no_accessible_restroom: "restroom",
  requires_steps: "steps",
  no_seating: "seating",
  not_quiet_enough: "quiet",
  diet_mismatch: "dietary",
  sold_out: "Sold out",
  requires_booking_not_available: "booking",
  lead_time_too_short: "notice",
  weather_unsafe: "weather",
  duplicate: "stop",
  already_planned: "plan",
  excluded_by_traveller: "excluded",
  seasonal_mismatch: "season",
  no_route: "route",
  unverified_required_fact: "unverified",
};

const ALL_UNITS: RejectionUnit[] = [
  "minutes",
  "inr",
  "metres",
  "km",
  "seats",
  "days",
  "none",
];

describe("rejection code table", () => {
  it("has one CodeSpec per RejectionCode, and no extras", () => {
    const tableCodes = Object.keys(REJECTION_CODES).sort();
    const unionCodes = [...REJECTION_CODES_LIST].sort();
    expect(tableCodes).toEqual(unionCodes);
    expect(tableCodes).toHaveLength(26);
  });

  it("keeps every spec keyed by its own code", () => {
    for (const code of REJECTION_CODES_LIST) {
      expect(REJECTION_CODES[code].code).toBe(code);
    }
  });

  it("marks exactly three codes advisory, and the table is the whole story", () => {
    const advisory = REJECTION_CODES_LIST.filter((c) => REJECTION_CODES[c].advisory).sort();
    expect(advisory).toEqual([
      "hours_unverified",
      "requires_booking_not_available",
      "unverified_required_fact",
    ]);
  });

  it("never marks the same code both ways", () => {
    for (const code of REJECTION_CODES_LIST) {
      expect(typeof REJECTION_CODES[code].advisory).toBe("boolean");
    }
  });
});

describe("rejection sentences", () => {
  it("carries a named fact and reads as a finished sentence with no numbers", () => {
    for (const code of REJECTION_CODES_LIST) {
      const sentence = rejectionSentence(code);
      expect(sentence, code).toContain(NAMED_FACT[code]);
      expect(sentence, code).toMatch(/\.$/);
      expect(sentence.endsWith(".."), code).toBe(false);
      expect(sentence.length, code).toBeGreaterThan(12);
    }
  });

  it("carries the measured number as soon as a numeric shortfall exists", () => {
    for (const code of REJECTION_CODES_LIST) {
      const numeric = rejectionSentence(code, { shortfall: 42, unit: "minutes" });
      const unitless = rejectionSentence(code, { shortfall: 42, unit: "none" });
      if (numeric !== unitless) {
        expect(numeric, code).toMatch(/\d/);
      }
    }
  });

  it("quotes a shortfall only for the nine codes that measure one, in the code's own unit", () => {
    const measured = REJECTION_CODES_LIST.filter(
      (c) => rejectionSentence(c, { shortfall: 42 }) !== `${REJECTION_CODES[c].sentence({})}`,
    ).sort();
    expect(measured).toEqual([
      "capacity_exceeded",
      "closed_during_window",
      "duplicate",
      "duration_exceeds_budget",
      "lead_time_too_short",
      "over_budget",
      "over_budget_per_person",
      "too_far",
      "travel_time_exceeds_budget",
    ]);
  });

  it("bans the house-style offenders in every reachable sentence", () => {
    const calls: string[] = [];
    for (const code of REJECTION_CODES_LIST) {
      calls.push(rejectionSentence(code));
      calls.push(rejectionSentence(code, { shortfall: 40, unit: "minutes" }));
      calls.push(rejectionSentence(code, { extra: "closed 10 am to 8 pm" }));
    }
    for (const sentence of calls) {
      expect(sentence).not.toContain(EM_DASH);
      expect(sentence).not.toMatch(EMOJI);
      for (const phrase of BANNED_PHRASES) {
        expect(sentence.toLowerCase()).not.toContain(phrase);
      }
    }
  });

  it("renders the shortfall in the unit it was measured in", () => {
    expect(rejectionSentence("too_far", { shortfall: 17, unit: "minutes" })).toBe(
      "Too far to fit your travel window, 17 min short.",
    );
    expect(rejectionSentence("capacity_exceeded", { shortfall: 1, unit: "seats" })).toBe(
      "Seats fewer people than your party, 1 seat short.",
    );
    expect(rejectionSentence("capacity_exceeded", { shortfall: 3, unit: "seats" })).toBe(
      "Seats fewer people than your party, 3 seats short.",
    );
    expect(rejectionSentence("over_budget", { shortfall: 900, unit: "inr" })).toBe(
      "Costs more than you budgeted, 900 rupees short.",
    );
    expect(rejectionSentence("duplicate", { shortfall: 300, unit: "metres" })).toBe(
      "Already covered by a stop you have, 300 m short.",
    );
    expect(rejectionSentence("duplicate", { shortfall: 1.25, unit: "km" })).toBe(
      "Already covered by a stop you have, 1.3 km short.",
    );
  });

  it("prefers the caller's named fact over a bare number", () => {
    expect(
      rejectionSentence("too_far", { shortfall: 17, unit: "minutes", extra: "42 min away by taxi, your limit is 25 min" }),
    ).toBe("Too far to fit your travel window: 42 min away by taxi, your limit is 25 min.");
  });

  it("strips a trailing period off the caller's clause so sentences never double up", () => {
    expect(rejectionSentence("closed_now", { extra: "Shuts at 8 pm." })).toBe(
      "Closed right now: Shuts at 8 pm.",
    );
  });

  it("floors a negative shortfall at zero instead of printing a negative magnitude", () => {
    expect(rejectionSentence("too_far", { shortfall: -12, unit: "minutes" })).toBe(
      "Too far to fit your travel window, 0 min short.",
    );
  });

  it("quotes a shortfall only when the unit can name one", () => {
    expect(rejectionSentence("not_step_free", { shortfall: 1, unit: "none" })).toBe(
      "No step-free route is recorded for this entrance.",
    );
  });

  it("matches the register the product promises", () => {
    expect(rejectionSentence("travel_time_exceeds_budget", { shortfall: 40, unit: "minutes" })).toBe(
      "Travel time does not fit the window you have left, 40 min short.",
    );
    expect(rejectionSentence("hours_unverified")).toBe(
      "Opening hours are unverified, so we will not claim it is open.",
    );
    expect(rejectionSentence("lead_time_too_short", { extra: "needs 24 h notice, you are planning 3 h ahead" })).toBe(
      "Needs more notice than you are planning ahead: needs 24 h notice, you are planning 3 h ahead.",
    );
    expect(rejectionSentence("seasonal_mismatch", { extra: "best from June to September, and it is October" })).toBe(
      "Out of season right now: best from June to September, and it is October.",
    );
  });
});

describe("rejection units", () => {
  it("has a label and a suffix for every unit", () => {
    for (const unit of ALL_UNITS) {
      expect(typeof REJECTION_UNIT_LABEL[unit], unit).toBe("string");
      expect(typeof REJECTION_UNIT_SUFFIX[unit], unit).toBe("string");
    }
  });

  it("keeps the trailing tokens the contract fixes", () => {
    expect(REJECTION_UNIT_SUFFIX).toEqual({
      minutes: "min",
      inr: "",
      km: "km",
      metres: "m",
      seats: "seats",
      days: "days",
      none: "",
    });
  });

  it("leaves the rupee sign to the sentence, so the suffix is empty for money", () => {
    expect(REJECTION_UNIT_SUFFIX.inr).toBe("");
    expect(REJECTION_UNIT_LABEL.inr).toBe("rupees");
  });
});

describe("runtime mirrors of the unions", () => {
  it("are duplicate free", () => {
    for (const list of [REJECTION_CODES_LIST, PROVENANCE_VALUES, ACCESS_NEEDS, DIET_NEEDS, COMPONENT_IDS]) {
      expect(new Set(list).size, list.join(",")).toBe(list.length);
    }
  });

  it("cover the sizes the frozen unions declare", () => {
    expect(REJECTION_CODES_LIST).toHaveLength(26);
    expect(PROVENANCE_VALUES).toHaveLength(5);
    expect(ACCESS_NEEDS).toHaveLength(7);
    expect(DIET_NEEDS).toHaveLength(5);
    expect(COMPONENT_IDS).toHaveLength(10);
  });

  it("names the access needs the gate and the replan trigger both reference", () => {
    expect(ACCESS_NEEDS).toContain("step_free");
    expect(ACCESS_NEEDS).toContain("stroller_ok");
    expect(ACCESS_NEEDS).toContain("accessible_restroom");
  });
});

describe("provenanced field list", () => {
  it("is the 19 fields the v2 record annotates", () => {
    const fields: ProvenancedField[] = [
      "name", "coordinates", "address", "category", "duration", "price",
      "capacity", "openingHours", "accessibility", "indoor", "kidFriendly",
      "booking", "seasonality", "bestTime", "diet", "rating", "reviewCount",
      "media", "pricePerPerson",
    ];
    expect(fields).toHaveLength(19);
    expect(new Set(fields).size).toBe(19);
  });
});

describe("house style in the codes source", () => {
  const source = readFileSync(join(process.cwd(), "lib/engine/contracts/codes.ts"), "utf8");

  it("has no em dash character", () => {
    expect(source.includes(EM_DASH)).toBe(false);
  });

  it("has no emoji", () => {
    expect(EMOJI.test(source)).toBe(false);
  });

  it("does not spell the banned phrases as a sentence", () => {
    for (const phrase of BANNED_PHRASES) {
      const quoted = `"${phrase}"`;
      expect(source.includes(quoted), phrase).toBe(false);
      expect(source.includes(`'${phrase}'`), phrase).toBe(false);
    }
  });
});
