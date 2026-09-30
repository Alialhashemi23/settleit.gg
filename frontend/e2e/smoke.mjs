// End-to-end smoke test through the real dev stack: vite (5173) → proxy → wrangler dev (8787).
// Run both dev servers first (see README), then: bun run e2e   (needs: bun add -d playwright + npx playwright install chromium)
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}) });
const shots = [];
import { mkdirSync } from 'node:fs';
mkdirSync('e2e/out', { recursive: true });
async function ctx(name) {
  const c = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console.error`, m.text()); });
  return { c, p, name };
}
async function shot(p, label) { const f = `${label}.png`; await p.screenshot({ path: `e2e/out/${f}`, fullPage: true }); shots.push(f); }

const ana = await ctx('ana');
const ben = await ctx('ben');
const cy = await ctx('cy');

// Create a room.
await ana.p.goto(BASE, { waitUntil: 'networkidle' });
await ana.p.getByRole('button', { name: 'Create a room' }).click();
await ana.p.getByPlaceholder('e.g. Alex').fill('Ana');
await ana.p.getByRole('button', { name: 'Create room' }).click();
await ana.p.waitForURL(/\/room\/[A-Z]{4}-\d{4}/);
const code = ana.p.url().split('/room/')[1];
console.log('room', code);
await ana.p.getByText("I'm ready").waitFor();
await shot(ana.p, '01-lobby');

// Two more join via the /join link.
for (const who of [ben, cy]) {
  await who.p.goto(`${BASE}/join/${code}`, { waitUntil: 'networkidle' });
  await who.p.getByPlaceholder('e.g. Alex').fill(who.name === 'ben' ? 'Ben' : 'Cy');
  await who.p.getByRole('button', { name: 'Join', exact: true }).click();
  await who.p.getByText("I'm ready").waitFor();
}
await ana.p.getByText('Ben').first().waitFor();
await ana.p.getByText('Cy').first().waitFor();

// Ready up → question deals automatically.
await ana.p.getByRole('button', { name: "I'm ready" }).click();
await ben.p.getByRole('button', { name: "I'm ready" }).click(); // two ready players start the game; Cy is present so he is eligible too
await ana.p.getByText(/Q1 · Vote/).waitFor({ timeout: 10000 });
await shot(ana.p, '02-vote');
const prompt = await ana.p.locator('.prompt').textContent();
console.log('question', prompt);

// Everyone votes: Ana + Ben option 1, Cy option 2 → closes early into discuss.
const opt = (p, i) => p.locator('button.option').nth(i);
await opt(ana.p, 0).click();
await ana.p.getByText('Saved').waitFor();
await opt(ben.p, 0).click();
await opt(cy.p, 1).click();
await ana.p.getByText(/Q1 · Discuss/).waitFor({ timeout: 10000 });
await ana.p.getByText(/2 of 3 picked/).waitFor();
await shot(ana.p, '03-discuss');

// Late joiner sees the round but is not eligible.
const dee = await ctx('dee');
await dee.p.goto(`${BASE}/join/${code}`, { waitUntil: 'networkidle' });
await dee.p.getByPlaceholder('e.g. Alex').fill('Dee');
await dee.p.getByRole('button', { name: 'Join', exact: true }).click();
await dee.p.getByText("You'll join on the next question").waitFor();

// Simulate Ana locking her phone: drop her socket by going offline, then back.
await ana.c.setOffline(true);
await ana.p.waitForTimeout(1500);
await ana.c.setOffline(false);
await ana.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

// Revote: Ana + Ben request → majority of 3 voters.
await ana.p.getByRole('button', { name: /Revote/ }).click();
await ben.p.getByRole('button', { name: /Revote/ }).click();
await cy.p.getByText(/Q1 · Revote/).waitFor({ timeout: 10000 });
await shot(cy.p, '04-revote');
await opt(cy.p, 0).click(); // Cy switches → unanimous
await opt(ana.p, 0).click();
await opt(ben.p, 0).click();
await ana.p.getByText(/Q1 · Verdict/).waitFor({ timeout: 20000 });
await ana.p.getByText(/Unanimous/).waitFor();
await ana.p.getByText(/Plot twist: Cy/).waitFor();
await shot(ana.p, '05-verdict');

// Next question deals after the verdict; Dee is eligible now.
await dee.p.getByText(/Q2 · Vote/).waitFor({ timeout: 20000 });
await dee.p.locator('button.option').first().click();
await dee.p.getByText('Saved').waitFor();
await shot(dee.p, '06-late-joiner-votes');

// Recap works mid-session.
await ana.p.getByRole('button', { name: 'Recap' }).click();
await ana.p.getByText('Recap').first().waitFor();
await ana.p.getByText(prompt.trim()).waitFor();
await shot(ana.p, '07-recap');

// Daily flow for one browser.
await ben.p.goto(`${BASE}/daily`, { waitUntil: 'networkidle' });
await ben.p.getByRole('heading', { name: 'Read the crowd' }).waitFor();
await ben.p.locator('.card.raised button.btn').first().click();
await ben.p.getByRole('button', { name: 'Lock it in' }).click();
await ben.p.getByText(/You picked/).waitFor();
await shot(ben.p, '08-daily');

// Topics + admin gate.
await cy.p.goto(`${BASE}/topics`, { waitUntil: 'networkidle' });
await cy.p.getByRole('heading', { name: 'Most debated' }).waitFor();
await cy.p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await cy.p.getByText('Admin sign-in').waitFor();
await shot(cy.p, '09-admin-gate');

console.log('E2E OK', shots.join(' '));
await browser.close();
