import { describe, expect, it } from "vitest";

import { DEVANAGARI_TOKEN, foldForMatch, stem, tokenize, uniqueTokens } from "./tokenize";

describe("stem", () => {
  it("collapses the inflections that appear in this corpus", () => {
    expect(stem("forts")).toBe("fort");
    expect(stem("galleries")).toBe("gallery");
    expect(stem("cafes")).toBe("cafe");
    expect(stem("ghats")).toBe("ghat");
    expect(stem("vibes")).toBe("vibe");
    expect(stem("classes")).toBe("class");
    expect(stem("learning")).toBe("learn");
    expect(stem("swimming")).toBe("swim");
    expect(stem("walked")).toBe("walk");
    expect(stem("visited")).toBe("visit");
  });

  it("leaves a word alone when the suffix belongs to the word", () => {
    expect(stem("fort")).toBe("fort");
    expect(stem("dharamshala")).toBe("dharamshala");
    expect(stem("krishna")).toBe("krishna");
    expect(stem("glass")).toBe("glass");
    expect(stem("villas")).toBe("villa");
    expect(stem("closed")).toBe("closed");
    expect(stem("based")).toBe("based");
    expect(stem("cafe")).toBe("cafe");
  });

  it("never strips a suffix it cannot spare", () => {
    expect(stem("ing")).toBe("ing");
    expect(stem("ed")).toBe("ed");
    expect(stem("ies")).toBe("ies");
    expect(stem("s")).toBe("s");
  });
});

describe("tokenize", () => {
  it("folds case and splits on punctuation", () => {
    expect(tokenize("The Cafes, in Fort!")).toEqual(["cafe", "fort"]);
    expect(tokenize("mum-bai.")).toEqual(["mum", "bai"]);
  });

  it("handles the awkward cases the brief lists", () => {
    expect(tokenize("fort")).toEqual(["fort"]);
    expect(tokenize("forts")).toEqual(["fort"]);
    expect(tokenize("forts'")).toEqual(["fort"]);
    expect(tokenize("dharamshala")).toEqual(["dharamshala"]);
    expect(tokenize("galleries")).toEqual(["gallery"]);
    expect(tokenize("cafes")).toEqual(["cafe"]);
    expect(tokenize("ghats")).toEqual(["ghat"]);
    expect(tokenize("vibes")).toEqual(["vibe"]);
    expect(tokenize("krishna")).toEqual(["krishna"]);
  });

  it("matches an inflected query to an uninflected record field", () => {
    expect(tokenize("galleries")).toEqual(tokenize("gallery"));
    expect(tokenize("forts")).toEqual(tokenize("fort"));
  });

  it("drops only function words, so a place name stays searchable", () => {
    expect(tokenize("the of and with near for at by from to")).toEqual([]);
    expect(tokenize("Hillside")).toEqual(["hillside"]);
  });

  it("drops one-character tokens", () => {
    expect(tokenize("a b cd x y zz")).toEqual(["cd", "zz"]);
  });

  it("returns an empty list for punctuation only", () => {
    expect(tokenize("!!! --- ...")).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });

  it("keeps a repeated token, because repetition in a description is a signal", () => {
    expect(tokenize("trail trail")).toEqual(["trail", "trail"]);
    expect(uniqueTokens(tokenize("trail trail"))).toEqual(["trail"]);
  });
});

describe("foldForMatch", () => {
  it("collapses a Devanagari run to one stable class token", () => {
    expect(foldForMatch("बगदादी रेस्टोरेंट")).toBe(`${DEVANAGARI_TOKEN} ${DEVANAGARI_TOKEN}`);
    expect(tokenize("बगदादी रेस्टोरेंट")).toEqual([DEVANAGARI_TOKEN, DEVANAGARI_TOKEN]);
  });

  it("keeps the Latin part of a mixed-script name", () => {
    expect(tokenize("Inorbit mall devanagari")).toEqual(["inorbit", "mall", DEVANAGARI_TOKEN]);
  });

  it("folds punctuation and spacing so a phrase is comparable as a string", () => {
    expect(foldForMatch("Sanjay Gandhi National Park")).toBe("sanjay gandhi national park");
    expect(foldForMatch("  SANJAY   gandhi, national park. ")).toBe("sanjay gandhi national park");
  });

  it("does not read a single Latin-1 punctuation mark as a script", () => {
    expect(foldForMatch("a  ’  b")).toBe("a b");
  });

  it("labels another non-Latin script rather than dropping it", () => {
    expect(foldForMatch("தமிழ் உணவு")).toBe("nonlatin nonlatin");
  });
});
