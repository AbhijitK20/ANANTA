import { describe, expect, it } from "vitest";
import { PenaltyTable } from "./penalty";

describe("PenaltyTable", () => {
  it("starts empty and sums to nothing", () => {
    const table = new PenaltyTable();
    expect(table.entries()).toEqual([]);
    expect(table.total()).toBe(0);
    expect(table.penaltyOf(["a", "b"])).toBe(0);
    expect(table.penaltyFor("a", "b")).toBe(0);
  });

  it("charges every ordered pair in a tour, once per record", () => {
    const table = new PenaltyTable({ step: 0.5 });
    table.record(["a", "b", "c"]);
    expect(table.penaltyFor("a", "b")).toBe(0.5);
    expect(table.penaltyFor("b", "c")).toBe(0.5);
    expect(table.penaltyFor("b", "a")).toBe(0);
    expect(table.total()).toBe(1);
  });

  it("makes a repeat strictly more expensive to reuse", () => {
    const table = new PenaltyTable({ step: 0.5 });
    const order = ["a", "b"];
    expect(table.adjust(order, 10)).toBe(10);
    table.record(order);
    expect(table.adjust(order, 10)).toBe(10.5);
    table.record(order);
    expect(table.adjust(order, 10)).toBe(11);
    expect(table.total()).toBe(1);
  });

  it("charges every leg of a longer tour, not just the first", () => {
    const table = new PenaltyTable({ step: 0.5 });
    table.record(["a", "b", "c"]);
    expect(table.adjust(["a", "b", "c"], 10)).toBe(11);
    table.record(["a", "b", "c"]);
    expect(table.adjust(["a", "b", "c"], 10)).toBe(12);
    expect(table.penaltyFor("a", "b")).toBe(1);
    expect(table.penaltyFor("b", "c")).toBe(1);
  });

  it("caps a pair so one hot edge cannot run away", () => {
    const table = new PenaltyTable({ step: 1, ceiling: 3 });
    for (let i = 0; i < 20; i += 1) table.record(["a", "b"]);
    expect(table.penaltyFor("a", "b")).toBe(3);
  });

  it("decay strictly decreases every penalty", () => {
    const table = new PenaltyTable({ step: 1 });
    table.record(["a", "b"]);
    table.record(["b", "c"]);
    table.record(["c", "d"]);
    const before = table.entries();
    expect(before).toHaveLength(3);
    table.decay(0.5);
    const after = table.entries();
    expect(after.map(([key]) => key)).toEqual(before.map(([key]) => key));
    for (let i = 0; i < after.length; i += 1) {
      expect(after[i][1]).toBe(before[i][1] * 0.5);
      expect(after[i][1]).toBeLessThan(before[i][1]);
    }
    expect(table.total()).toBe(1.5);
  });

  it("reset empties the table and nothing else", () => {
    const table = new PenaltyTable({ step: 0.5 });
    table.record(["a", "b"]);
    table.reset();
    expect(table.entries()).toEqual([]);
    expect(table.adjust(["a", "b"], 3)).toBe(3);
  });

  it("is deterministic: the same records give the same numbers", () => {
    const first = new PenaltyTable({ step: 0.25 });
    const second = new PenaltyTable({ step: 0.25 });
    for (const order of [["a", "b"], ["b", "c"], ["a", "b"], ["a", "b"]]) {
      first.record(order);
      second.record(order);
    }
    expect(first.entries()).toEqual(second.entries());
    // a-b three times at 0.25 is 0.75, b-c once is 0.25.
    expect(first.total()).toBe(1);
  });

  it("does not confuse ids that share a prefix", () => {
    const table = new PenaltyTable({ step: 1 });
    table.record(["a", "bc"]);
    expect(table.penaltyFor("a", "bc")).toBe(1);
    expect(table.penaltyFor("ab", "c")).toBe(0);
    expect(table.penaltyFor("a", "b")).toBe(0);
  });
});
