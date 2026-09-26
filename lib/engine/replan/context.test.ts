import { describe, expect, it } from "vitest";
import { assertIntentIntact, cloneForMutation, deepFreeze, draftFor } from "./context";
import { makeContext } from "./fixtures.test";

/** Mutate and report whether strict mode threw. */
const attempt = (mutate: () => void): boolean => {
  try {
    mutate();
    return false;
  } catch {
    return true;
  }
};

describe("buildContext", () => {
  it("freezes the original deeply, so a nested mutation has no effect", () => {
    const ctx = makeContext({ availableMinutes: 240 });

    expect(Object.isFrozen(ctx.original)).toBe(true);
    expect(Object.isFrozen(ctx.original.profile.weights)).toBe(true);
    expect(Object.isFrozen(ctx.original.city.neighbourhoods)).toBe(true);

    const topLevelThrew = attempt(() => {
      (ctx.original as { availableMinutes: number }).availableMinutes = 5;
    });
    const nestedThrew = attempt(() => {
      (ctx.original.profile.weights as { interest: number }).interest = 999;
    });
    const deepThrew = attempt(() => {
      ctx.original.profile.bandit.arms[0].alpha = 999;
    });

    expect({ topLevelThrew, nestedThrew, deepThrew }).toEqual({
      topLevelThrew: true,
      nestedThrew: true,
      deepThrew: true,
    });
    expect(ctx.original.availableMinutes).toBe(240);
    expect(ctx.original.profile.weights.interest).toBe(1);
    expect(ctx.original.profile.bandit.arms[0].alpha).toBe(1);
  });

  it("keeps the original a separate structural copy, not a shared graph", () => {
    const ctx = makeContext();

    expect(ctx.original).not.toBe(ctx);
    expect(ctx.original.profile).not.toBe(ctx.profile);
    expect(ctx.original.profile.weights).not.toBe(ctx.profile.weights);
    expect(ctx.original.city).not.toBe(ctx.city);
    expect(ctx.original.original).toBe(ctx.original);

    // A learned weight edit on the live context must not reach the baseline.
    ctx.profile.weights.interest = 0.25;
    expect(ctx.original.profile.weights.interest).toBe(1);
    expect(ctx.profile.weights.interest).toBe(0.25);
  });

  it("freezes every nested object, not only the top level", () => {
    const ctx = makeContext();
    expect(Object.isFrozen(ctx.original.origin)).toBe(true);
    expect(Object.isFrozen(ctx.original.profile.bandit.arms[0])).toBe(true);
    expect(attempt(() => {
      ctx.original.origin.label = "somewhere else";
    })).toBe(true);
    expect(ctx.original.origin.label).toBe("Central");
  });
});

describe("cloneForMutation", () => {
  it("carries one frozen baseline through three mutations by reference", () => {
    const ctx = makeContext();
    const baseline = ctx.original;
    const snapshot = { ...baseline };

    const first = cloneForMutation(ctx, { availableMinutes: 150 });
    const second = cloneForMutation(first, { budgetInr: 400 });
    const third = cloneForMutation(second, { pace: "relaxed" });

    expect(first.original).toBe(baseline);
    expect(second.original).toBe(first.original);
    expect(third.original).toBe(baseline);

    expect(third).not.toBe(second);
    expect(third.availableMinutes).toBe(150);
    expect(third.budgetInr).toBe(400);
    expect(third.pace).toBe("relaxed");

    expect({ ...baseline }).toEqual(snapshot);
    expect(baseline.availableMinutes).toBe(240);
    expect(baseline.budgetInr).toBe(1000);
    expect(baseline.pace).toBe("normal");
  });

  it("refuses to let a patch replace the baseline", () => {
    const ctx = makeContext();
    const other = makeContext({ availableMinutes: 10 });
    const patched = cloneForMutation(ctx, { original: other.original });
    expect(patched.original).toBe(ctx.original);
    expect(() => assertIntentIntact(patched, other.original)).toThrow(
      /original was replaced/,
    );
  });
});

describe("draftFor", () => {
  it("hands out a private copy that cannot reach the caller's context", () => {
    const ctx = makeContext();
    const draft = draftFor(ctx);

    expect(draft).not.toBe(ctx);
    expect(draft.profile.weights).not.toBe(ctx.profile.weights);
    expect(draft.original).toBe(ctx.original);

    draft.profile.weights.interest = 0.1;
    expect(ctx.profile.weights.interest).toBe(1);
    expect(ctx.original.profile.weights.interest).toBe(1);
  });
});

describe("deepFreeze", () => {
  it("leaves primitives and nulls alone and returns what it froze", () => {
    expect(deepFreeze(7)).toBe(7);
    expect(deepFreeze(null)).toBeNull();
    const frozen = deepFreeze({ a: { b: [1, 2] } });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
  });
});
