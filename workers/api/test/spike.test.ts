import { env, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("spike", () => {
  it("d1 + worker", async () => {
    const r = await SELF.fetch("https://x/");
    expect(await r.text()).toBe("ok");
    const rows = await env.DB.prepare("SELECT * FROM spike").all();
    expect(rows.results.length).toBe(1);
  });
  it("durable object state survives abort", async () => {
    const id = env.ROOMS.idFromName("spike");
    const stub = env.ROOMS.get(id);
    await stub.put("a", "1");
    await stub.abortSelf().catch(() => {});
    const stub2 = env.ROOMS.get(id);
    expect(await stub2.get("a")).toBe("1");
  });
});
