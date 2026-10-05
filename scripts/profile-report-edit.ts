/**
 * Playwright + CDP CPU profile for a report /edit load (ELR hang investigations).
 *
 * Prereqs: server on PROFILE_BASE_URL with ALLOW_TEST_LOGIN (+ TEST_AUTH_EMAIL).
 *
 *   pnpm profile:report-edit -- <reportId> [cpuThrottle] [label]
 *
 * Env:
 *   PROFILE_BASE_URL   default http://127.0.0.1:3000
 *   PROFILE_OUT_DIR    default artifacts/profile-report-edit
 *   PROFILE_MAX_MS       default 90000
 *   PROFILE_ALLOW_STUBS  default 0 — allow 1 stub section before "mounted"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { summarizeCpuProfile, type CpuProfile } from "./lib/cpu-profile-summary";

const BASE = process.env.PROFILE_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = process.env.PROFILE_OUT_DIR ?? "artifacts/profile-report-edit";
const reportId = process.argv[2];
const throttle = Number(process.argv[3] ?? 1);
const label = process.argv[4] ?? `t${throttle}`;
const MAX_MS = Number(process.env.PROFILE_MAX_MS ?? 90_000);

if (!reportId) {
  console.error(`usage: pnpm profile:report-edit -- <reportId> [cpuThrottle] [label]
  PROFILE_BASE_URL=http://127.0.0.1:3010 pnpm profile:report-edit -- <id>`);
  process.exit(1);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const login = await page.request.post("/api/test/login", { data: {} });
  if (!login.ok()) {
    throw new Error(
      `test login ${login.status()} — start server with ALLOW_TEST_LOGIN and TEST_AUTH_EMAIL (see playwright.config webServer)`
    );
  }

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });

  await page.addInitScript(`
    window.__lt = []; window.__gaps = [];
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) { window.__lt.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }); });
      }).observe({ type: "longtask", buffered: true });
    } catch (e) {}
    (function () {
      var last = performance.now();
      setInterval(function () {
        var now = performance.now();
        if (now - last > 250) window.__gaps.push({ at: Math.round(last), gap: Math.round(now - last) });
        last = now;
      }, 50);
    })();
  `);

  const cdp = await context.newCDPSession(page);
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");

  const t0 = Date.now();
  const timeline: string[] = [];
  await page.goto(`/reports/${reportId}/edit`, { waitUntil: "commit" });

  let done = false;
  let lastState = "";
  let unresponsive = 0;
  const allowStubs = Number(process.env.PROFILE_ALLOW_STUBS ?? 0);

  while (Date.now() - t0 < MAX_MS) {
    const state = await Promise.race([
      page.evaluate(() => {
        const secs = Array.from(document.querySelectorAll("section[id]"));
        const mounted = secs.filter((s) => s.querySelector(".ProseMirror")).length;
        return {
          loading: document.body.innerText.includes("Loading report"),
          sections: secs.length,
          mounted,
          editors: document.querySelectorAll(".ProseMirror").length,
          rows: document.querySelectorAll(".ProseMirror tr").length,
          stubs: secs.filter((s) => !s.querySelector(".ProseMirror")).length,
        };
      }),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ]).catch(() => null);

    const at = Date.now() - t0;
    if (!state) {
      unresponsive += 1;
      timeline.push(`${at}ms  MAIN THREAD UNRESPONSIVE (>3s)`);
      continue;
    }
    const s = JSON.stringify(state);
    if (s !== lastState) {
      timeline.push(`${at}ms  ${s}`);
      lastState = s;
    }
    if (state.sections > 1 && state.mounted >= state.sections - allowStubs) {
      done = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  await new Promise((r) => setTimeout(r, 4000));
  const mountEnd = Date.now() - t0;

  let typing = "skipped";
  if (done) {
    try {
      const target = page.locator(".ProseMirror[contenteditable='true'] p").first();
      await target.click({ timeout: 10_000 });
      const mark = await page.evaluate(() => performance.now());
      const k0 = Date.now();
      await page.keyboard.type("profiling keystrokes!", { delay: 60 });
      await new Promise((r) => setTimeout(r, 3000));
      const lts = await page.evaluate(
        (m) => (window as unknown as { __lt: { start: number; dur: number }[] }).__lt.filter((l) => l.start >= m),
        mark
      );
      typing = `20 keys took ${Date.now() - k0 - 3000}ms wall (ideal 1260ms); longtasks ${lts.length} sum ${lts.reduce((a, b) => a + b.dur, 0)}ms max ${Math.max(0, ...lts.map((l) => l.dur))}ms`;
    } catch (e) {
      typing = `failed: ${(e as Error).message.slice(0, 120)}`;
    }
  }

  const { profile } = (await cdp.send("Profiler.stop")) as { profile: CpuProfile };
  const vitals = await Promise.race([
    page.evaluate(() => {
      const w = window as unknown as { __lt: { start: number; dur: number }[]; __gaps: { at: number; gap: number }[] };
      return { lt: w.__lt, gaps: w.__gaps };
    }),
    new Promise<null>((r) => setTimeout(() => r(null), 5000)),
  ]).catch(() => null);

  const baseName = `report-edit-${label}-${reportId.slice(0, 8)}`;
  const cpuprofilePath = path.join(OUT, `${baseName}.cpuprofile`);
  const summaryPath = path.join(OUT, `${baseName}.txt`);
  writeFileSync(cpuprofilePath, JSON.stringify(profile));

  const { busyUs, topSelfTime, topTotalAppTime } = summarizeCpuProfile(profile);
  const lt = vitals?.lt ?? [];

  const report = [
    `report ${reportId}  base ${BASE}  throttle ${throttle}x  wall ${Date.now() - t0}ms  allSectionsMounted=${done}  unresponsivePolls=${unresponsive}`,
    `script busy ${(busyUs / 1000).toFixed(0)}ms   longtasks ${lt.length}  sum ${lt.reduce((a, b) => a + b.dur, 0)}ms  max ${Math.max(0, ...lt.map((l) => l.dur))}ms`,
    `mount finished at ${mountEnd}ms; TYPING: ${typing}`,
    `worst longtasks: ${[...lt].sort((a, b) => b.dur - a.dur).slice(0, 8).map((l) => `${l.dur}ms@${l.start}`).join("  ")}`,
    `frame gaps >250ms: ${(vitals?.gaps ?? []).sort((a, b) => b.gap - a.gap).slice(0, 8).map((g) => `${g.gap}ms@${g.at}`).join("  ")}`,
    `artifacts: ${cpuprofilePath}`,
    "",
    "TIMELINE",
    ...timeline,
    "",
    `ERRORS (${errors.length})`,
    ...errors.slice(0, 15),
    "",
    "TOP SELF TIME",
    ...topSelfTime,
    "",
    "TOP TOTAL TIME (app code only)",
    ...topTotalAppTime,
  ].join("\n");

  writeFileSync(summaryPath, report);
  console.log(report);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
