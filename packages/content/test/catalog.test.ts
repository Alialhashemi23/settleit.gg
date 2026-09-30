import { describe, expect, it } from "vitest";
import { CATALOG, approvedQuestions, findVersion, questionsForRoom, resolve } from "../src/index.ts";

const BANNED = /\b(trump|biden|obama|democrat|republican|election|abortion|jesus|god|allah|bible|quran|church|sex|sexy|porn|nude|hookup)\b/i;

describe("catalog audit", () => {
  it("has unique stable ids and at least 60 approved prompts", () => {
    const ids = CATALOG.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(approvedQuestions().length).toBeGreaterThanOrEqual(60);
  });
  it("every version has 2–4 distinct options with unique option ids", () => {
    for (const q of CATALOG) for (const v of q.versions) {
      expect(v.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(v.options.length, q.id).toBeLessThanOrEqual(4);
      expect(new Set(v.options.map((o) => o.id)).size, q.id).toBe(v.options.length);
      expect(new Set(v.options.map((o) => o.text.toLowerCase())).size, q.id).toBe(v.options.length);
      expect(v.prompt.trim().length, q.id).toBeGreaterThan(3);
    }
  });
  it("versions are sequential and edits carry a note", () => {
    for (const q of CATALOG) {
      q.versions.forEach((v, i) => expect(v.version, q.id).toBe(i + 1));
      for (const v of q.versions.slice(1)) expect(v.note, q.id).toBeTruthy();
    }
  });
  it("approved prompts avoid excluded topics", () => {
    for (const q of approvedQuestions()) {
      expect(BANNED.test(q.prompt), q.id).toBe(false);
      for (const o of q.options) expect(BANNED.test(o.text), `${q.id} ${o.text}`).toBe(false);
    }
  });
  it("excluded and retired entries explain why", () => {
    for (const q of CATALOG) if (q.status !== "approved") expect(q.note, q.id).toBeTruthy();
  });
  it("no two approved prompts are identical", () => {
    const prompts = approvedQuestions().map((q) => q.prompt.toLowerCase().replace(/[^a-z ]/g, ""));
    expect(new Set(prompts).size).toBe(prompts.length);
  });
  it("resolves active versions and looks up old ones", () => {
    const q199 = CATALOG.find((q) => q.id === "q199")!;
    expect(resolve(q199).versionId).toBe("q199v2");
    expect(findVersion("q199v1")?.prompt).toBe("Worst movie ending?");
    expect(findVersion("nope")).toBeNull();
  });
  it("filters rooms by category and spoiler preference", () => {
    const anime = questionsForRoom(["anime"], true);
    expect(anime.length).toBeGreaterThan(5);
    expect(anime.every((q) => q.tags.includes("anime") && !q.spoiler)).toBe(true);
    expect(questionsForRoom(["mix"], false).length).toBe(approvedQuestions().length);
    expect(questionsForRoom([], true).some((q) => q.spoiler)).toBe(false);
  });
});
