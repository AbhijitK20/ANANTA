import { describe, expect, it } from "vitest";
import { applyMediaAction, mediaSeedRecords, approvedMediaIds } from "@/lib/media-store";
import { mediaSeed } from "@/lib/seed";

describe("mediaSeedRecords", () => {
  it("seeds approved records with a demo history entry", () => {
    const records = mediaSeedRecords();
    const approved = records.find(({ id }) => id === "media-kala-ghoda");
    expect(approved?.state).toBe("Approved");
    expect(approved?.history[0]?.action).toBe("Approved");
  });

  it("seeds archived and unreviewed records without a fabricated approval", () => {
    const records = mediaSeedRecords();
    expect(records.find(({ id }) => id === "media-archived-demo")?.state).toBe("Archived");
    expect(records.find(({ id }) => id === "media-archived-demo")?.history).toEqual([]);
    expect(records.find(({ id }) => id === "media-juhu-morning")?.state).toBe("Needs review");
    expect(records.find(({ id }) => id === "media-juhu-morning")?.history).toEqual([]);
  });
});

describe("applyMediaAction", () => {
  it("approving a record updates state and appends history", () => {
    const records = mediaSeedRecords();
    const next = applyMediaAction(records, "media-juhu-morning", "Approved");
    expect(next.find(({ id }) => id === "media-juhu-morning")?.state).toBe("Approved");
    expect(next.find(({ id }) => id === "media-juhu-morning")?.history.at(-1)?.action).toBe("Approved");
  });

  it("rejecting archives the record so it leaves discovery", () => {
    const records = mediaSeedRecords();
    const next = applyMediaAction(records, "media-kala-ghoda", "Rejected");
    expect(next.find(({ id }) => id === "media-kala-ghoda")?.state).toBe("Archived");
    expect(approvedMediaIds(next).has("media-kala-ghoda")).toBe(false);
  });

  it("marking stale returns an approved record to review without deleting history", () => {
    const records = mediaSeedRecords();
    const next = applyMediaAction(records, "media-kala-ghoda", "Marked stale");
    const record = next.find(({ id }) => id === "media-kala-ghoda");
    expect(record?.state).toBe("Needs review");
    expect(record?.history.length).toBe(2);
  });
});

describe("approvedMediaIds", () => {
  it("only lists currently approved records", () => {
    const records = mediaSeedRecords();
    const expected = mediaSeed.filter((item) => item.state === "Approved").map((item) => item.id);
    expect(approvedMediaIds(records)).toEqual(new Set(expected));
    expect(mediaSeed.every((item) => item.id !== undefined)).toBe(true);
  });
});
