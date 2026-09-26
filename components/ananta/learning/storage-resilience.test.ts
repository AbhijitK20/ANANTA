import { describe, expect, it, beforeEach, afterEach } from "vitest";

/**
 * The prompt's last verification step: "Put a corrupt value in local storage and
 * confirm the app does not crash."
 *
 * `vitest` runs in `environment: "node"`, so there is no `localStorage` here and
 * no DOM, which is exactly why the storage reads take a `Storage`-shaped
 * argument: the pure comparison logic is testable without a browser, and the
 * caller is a three-line pass-through of `window.localStorage`.
 */

/** The subset of the Storage interface these modules actually use. */
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { written: Record<string, string> } {
  const data: Record<string, string> = { ...seed };
  const written: Record<string, string> = {};
  return {
    written,
    get length() {
      return Object.keys(data).length;
    },
    key: (index: number) => Object.keys(data)[index] ?? null,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
      written[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
}

/** Throws on both read and write, the way a blocked origin does. */
function blockedStorage(): StorageLike {
  return {
    get length(): number {
      throw new Error("SecurityError");
    },
    key: () => {
      throw new Error("SecurityError");
    },
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
}

/** Reads fine, refuses every write, the way a full quota does. */
function readOnlyStorage(seed: Record<string, string> = {}): StorageLike {
  const inner = fakeStorage(seed);
  return {
    get length() {
      return inner.length;
    },
    key: inner.key,
    getItem: inner.getItem,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
}

beforeEach(() => {
  // The modules under test read `window` at call time, so a minimal global is
  // installed for the duration of each test rather than at import time.
  (globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage() };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("the availability snapshot survives a corrupt store", () => {
  it("treats unparseable JSON as no snapshot rather than throwing", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-saved-availability": "{not json" }),
    };
    const { rememberAvailability } = await import("@/components/ananta/learning/availability-snapshot");
    const record = {
      id: "x",
      availability: { updatedAt: "2026-09-20", soldOutAt: null, remainingCapacity: null, leadTimeMinutes: 0, bookingUrl: null },
    } as never;
    expect(() => rememberAvailability([record])).not.toThrow();
  });

  it("drops a snapshot from an older shape that has no timestamp", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({
        "ananta-saved-availability": JSON.stringify({ x: { soldOutAt: "2026-01-01T00:00:00Z" } }),
      }),
    };
    const { availabilityChange } = await import("@/components/ananta/learning/availability-snapshot");
    const record = {
      id: "x",
      availability: { updatedAt: "2026-09-20", soldOutAt: null, remainingCapacity: null, leadTimeMinutes: 0, bookingUrl: null },
    } as never;
    // No usable snapshot, so the honest answer is "saved, here is when the
    // record was checked", never a fabricated "nothing changed".
    const change = availabilityChange(record, "2026-09-20T00:00:00Z");
    expect(change.kind).toBe("no-snapshot");
  });

  it("never throws when localStorage rejects the write", async () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: readOnlyStorage() };
    const { rememberAvailability, forgetAvailability } = await import(
      "@/components/ananta/learning/availability-snapshot"
    );
    const record = {
      id: "x",
      availability: { updatedAt: "2026-09-20", soldOutAt: null, remainingCapacity: null, leadTimeMinutes: 0, bookingUrl: null },
    } as never;
    expect(() => rememberAvailability([record])).not.toThrow();
    expect(() => forgetAvailability([record])).not.toThrow();
  });

  it("ignores a snapshot store that is an array rather than an object", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-saved-availability": "[1,2,3]" }),
    };
    const { availabilityChange } = await import("@/components/ananta/learning/availability-snapshot");
    const record = {
      id: "x",
      availability: { updatedAt: "2026-09-20", soldOutAt: null, remainingCapacity: null, leadTimeMinutes: 0, bookingUrl: null },
    } as never;
    expect(availabilityChange(record, "2026-09-20T00:00:00Z").kind).toBe("no-snapshot");
  });
});

describe("the learner store survives a corrupt read", () => {
  /** A store the reader accepts: one arm per `COMPONENT_IDS` member. */
  const fullStore = (observations: number) => {
    const arms = [
      "interest", "rating", "value", "authenticity", "weather",
      "crowd", "novelty", "groupFit", "travelFriction", "reliability",
    ].map((component) => ({ component, alpha: 2, beta: 2, pulls: 1 }));
    return JSON.stringify({
      bandit: { arms, observations, updatedAt: "2026-09-20" },
      countedChoices: [],
    });
  };

  it("falls back to the prior and says so when the stored JSON is not an object", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-learner": '"a string"' }),
    };
    const { readLearner, PRIOR_WEIGHTS } = await import("@/components/ananta/learning");
    const state = readLearner("2026-09-20T00:00:00+05:30");
    expect(state.bandit.observations).toBe(0);
    // Ten arms, one per component, every one at its prior strength with no pulls.
    expect(state.bandit.arms).toHaveLength(10);
    for (const arm of state.bandit.arms) {
      expect(arm.pulls, arm.component).toBe(0);
      expect(arm.alpha, arm.component).toBeGreaterThan(0);
      expect(arm.beta, arm.component).toBeGreaterThan(0);
    }
    expect(state.bandit.observations).toBe(0);
    // The fallback is not silent. This is the sentence the panel shows.
    expect(state.resetReason).toBeTruthy();
    expect(state.resetReason).toMatch(/unreadable/i);
  });

  it("falls back to the prior when the stored JSON is an array", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-learner": "[1,2,3]" }),
    };
    const { readLearner } = await import("@/components/ananta/learning");
    expect(readLearner("2026-09-20T00:00:00+05:30").bandit.observations).toBe(0);
  });

  it("falls back to the prior when the stored JSON is not parseable", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-learner": "{broken" }),
    };
    const { readLearner, PRIOR_WEIGHTS } = await import("@/components/ananta/learning");
    const state = readLearner("2026-09-20T00:00:00+05:30");
    expect(state.bandit.observations).toBe(0);
    // Ten arms, one per component, every one at its prior strength with no pulls.
    expect(state.bandit.arms).toHaveLength(10);
    for (const arm of state.bandit.arms) {
      expect(arm.pulls, arm.component).toBe(0);
      expect(arm.alpha, arm.component).toBeGreaterThan(0);
      expect(arm.beta, arm.component).toBeGreaterThan(0);
    }
    expect(state.resetReason).toMatch(/unreadable/i);
  });

  it("refuses an incomplete arm set rather than half-loading a profile", async () => {
    // One arm is not a profile. Loading it would show one weight as learned and
    // nine as prior, which reads as a finding rather than a broken store.
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({
        "ananta-learner": JSON.stringify({
          bandit: { arms: [{ component: "interest", alpha: 3, beta: 2, pulls: 4 }], observations: 9, updatedAt: "" },
        }),
      }),
    };
    const { readLearner, PRIOR_WEIGHTS } = await import("@/components/ananta/learning");
    const state = readLearner("2026-09-20T00:00:00+05:30");
    expect(state.bandit.observations).toBe(0);
    // Ten arms, one per component, every one at its prior strength with no pulls.
    expect(state.bandit.arms).toHaveLength(10);
    for (const arm of state.bandit.arms) {
      expect(arm.pulls, arm.component).toBe(0);
      expect(arm.alpha, arm.component).toBeGreaterThan(0);
      expect(arm.beta, arm.component).toBeGreaterThan(0);
    }
    expect(state.resetReason).toMatch(/incomplete|older version/i);
  });

  it("reads a complete store and keeps the observation count", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-learner": fullStore(9) }),
    };
    const { readLearner } = await import("@/components/ananta/learning");
    const state = readLearner("2026-09-20T00:00:00+05:30");
    expect(state.bandit.observations).toBe(9);
    expect(state.resetReason).toBeNull();
  });

  it("falls back to the prior and says so when the browser refuses the read", async () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: blockedStorage() };
    const { readLearner } = await import("@/components/ananta/learning");
    const state = readLearner("2026-09-20T00:00:00+05:30");
    expect(state.bandit.observations).toBe(0);
    // Ten arms, one per component, every one at its prior strength with no pulls.
    expect(state.bandit.arms).toHaveLength(10);
    for (const arm of state.bandit.arms) {
      expect(arm.pulls, arm.component).toBe(0);
      expect(arm.alpha, arm.component).toBeGreaterThan(0);
      expect(arm.beta, arm.component).toBeGreaterThan(0);
    }
    expect(state.resetReason).toMatch(/could not be read/i);
  });

  it("treats an empty store as a first visit, not a failure", async () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage() };
    const { readLearner } = await import("@/components/ananta/learning");
    const state = readLearner("2026-09-20T00:00:00+05:30");
    expect(state.bandit.observations).toBe(0);
    // Nothing went wrong, so nothing is claimed to have gone wrong.
    expect(state.resetReason).toBeNull();
  });
});

describe("the saved-id store survives a corrupt read", () => {
  it("returns an empty list rather than throwing on bad JSON", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-saved-experiences": "{{{broken" }),
    };
    const { readSaved } = await import("@/lib/saved");
    expect(readSaved()).toEqual([]);
  });

  it("drops non-string entries instead of rendering them as keys", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: fakeStorage({ "ananta-saved-experiences": '["a", 7, null, "b"]' }),
    };
    const { readSaved } = await import("@/lib/saved");
    expect(readSaved()).toEqual(["a", "b"]);
  });
});
