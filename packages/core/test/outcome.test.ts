import { describe, expect, it } from "vitest";
import { changedMinds, computeOutcome, describeOutcome, margin } from "../src/outcome.ts";

const opts = [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }];
const v = (o: string) => ({ optionId: o, at: 0 });

describe("computeOutcome", () => {
  it("labels no votes", () => {
    expect(computeOutcome({}, opts).kind).toBe("no_votes");
  });
  it("labels unanimous only with two or more votes", () => {
    expect(computeOutcome({ p1: v("a") }, opts).kind).toBe("majority");
    expect(computeOutcome({ p1: v("a"), p2: v("a") }, opts).kind).toBe("unanimous");
  });
  it("calls more than half a majority", () => {
    const o = computeOutcome({ p1: v("a"), p2: v("a"), p3: v("b") }, opts);
    expect(o.kind).toBe("majority");
    expect(o.leaders).toEqual(["a"]);
    expect(o.total).toBe(3);
  });
  it("calls a unique leader at or below half a leading choice", () => {
    const o = computeOutcome({ p1: v("a"), p2: v("a"), p3: v("b"), p4: v("c") }, opts);
    expect(o.kind).toBe("leading");
    expect(describeOutcome(o, opts)).toContain("No majority");
  });
  it("labels ties with every leader", () => {
    const o = computeOutcome({ p1: v("a"), p2: v("b") }, opts);
    expect(o.kind).toBe("tie");
    expect(o.leaders).toEqual(["a", "b"]);
    expect(margin(o)).toBe(0);
  });
  it("ignores votes for unknown options", () => {
    const o = computeOutcome({ p1: v("zzz") }, opts);
    expect(o.kind).toBe("no_votes");
  });
});

describe("changedMinds", () => {
  it("lists only actors in both tallies whose option differs", () => {
    expect(changedMinds({ p1: v("a"), p2: v("b"), p3: v("a") }, { p1: v("b"), p2: v("b"), p4: v("c") })).toEqual(["p1"]);
  });
});
