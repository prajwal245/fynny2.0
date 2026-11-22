#!/usr/bin/env node
/**
 * Records a CA's month-end flow in the real FynHelp app, from sign-in to a signed-off MIS, as a captioned video.
 *
 *   FYNHELP_URL=https://fynhelp.com FYNHELP_EMAIL=you@firm.com FYNHELP_PASSWORD='...' \
 *   FILES_DIR=/path/to/Satkaarika node scripts/record-client-flow.mjs
 *
 * Use a TEST firm login. The credentials are read from the environment, are never printed or stored by this script, and the
 * password field is masked on screen. The files are the real client's, so the video shows real names and figures: keep it internal
 * unless the client has agreed.
 *
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
 *
 * Optional environment
 *   CLIENT_NAME   client to create or open            (default "Satkaarika Enterprises")
 *   FILES_DIR     folder holding the files, named as in the Drive folder   (required unless DRY_RUN=1)
 *   OUT_DIR       where the video, downloads and failure screenshots go     (default ./recording-out)
 *   HEADLESS=0    show the browser while recording
 *   SLOW_MS       pause added after each action                              (default 700)
 *   MIS_FROM      first month to try for the MIS, e.g. "March 2026"          (default "March 2026")
 *   DRY_RUN=1     open the sign-in page and check the fields exist, then stop. Nothing is submitted.
 *
 * Each step is wrapped: a step that fails saves a screenshot and the run carries on where it safely can. The summary at the end
 * lists every step, so a failed selector is easy to see and fix.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

const env = (k, d) => (process.env[k] ?? d);
const URL_BASE = env("FYNHELP_URL", "https://fynhelp.com").replace(/\/+$/, "");
const EMAIL = env("FYNHELP_EMAIL", "");
const PASSWORD = env("FYNHELP_PASSWORD", "");
const CLIENT = env("CLIENT_NAME", "Satkaarika Enterprises");
const FILES_DIR = env("FILES_DIR", "");
const OUT = path.resolve(env("OUT_DIR", "recording-out"));
const SLOW = Number(env("SLOW_MS", "700"));
const MIS_FROM = env("MIS_FROM", "March 2026");
const DRY = env("DRY_RUN", "") === "1";
const HEADLESS = env("HEADLESS", "1") !== "0";

if (!DRY && (!EMAIL || !PASSWORD)) {
  console.error("Set FYNHELP_EMAIL and FYNHELP_PASSWORD in your environment (a test firm login). They are not read from anywhere else.");
  process.exit(2);
}
if (!DRY && (!FILES_DIR || !existsSync(FILES_DIR))) {
  console.error("Set FILES_DIR to the folder holding the client's files.");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

/** The upload order from the brief: statements first, then the books, then the loan and cash-credit statements. */
const FILES = [
  ["Bank statement", "Indian Bank CA 8088091704 FY 2025-26.pdf"],
  ["Bank statement", "Indian Bank CA 7856871247 FY 2025-26.pdf"],
  ["Tally books", "Satkaarika - Day Book FY 2025-26 (Tally 20-11-2026).xlsx"],
  ["Loan statement", "Indian Bank Term Loan 8174028236 FY 2025-26.pdf"],
  ["Loan statement", "Indian Bank GECL Loan 7185563880 FY 2025-26.pdf"],
  ["Loan statement", "Indian Bank Vehicle Loan 7983874447 FY 2025-26.pdf"],
  ["Cash credit statement", "Indian Bank CC 6407563276 16-03-2026 to 31-03-2026.pdf"],
];

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

/** A caption at the bottom of the screen, so the video explains itself. */
async function caption(text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__rec_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__rec_caption";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: 2147483647, maxWidth: "70%",
        background: "rgba(23,18,8,.9)", color: "#fff", font: "600 22px/1.35 system-ui, sans-serif", padding: "14px 26px",
        borderRadius: "14px", textAlign: "center", pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => undefined);
}
const pause = (ms = SLOW) => sleep(ms);

async function step(name, text, fn) {
  const t0 = Date.now();
  try {
    await caption(text);
    await fn();
    results.push({ name, ok: true, secs: Math.round((Date.now() - t0) / 1000) });
  } catch (e) {
    const shot = path.join(OUT, `FAILED-${name.replace(/\W+/g, "_")}.png`);
    await page.screenshot({ path: shot }).catch(() => undefined);
    results.push({ name, ok: false, secs: Math.round((Date.now() - t0) / 1000), why: String(e?.message ?? e).split("\n")[0], shot });
  }
}
const tab = (name) => page.getByRole("tab", { name: new RegExp(`^${name}`) }).first();

try {
  /* 1. Sign in */
  await step("sign-in", "Sign in to the firm's workspace", async () => {
    await page.goto(`${URL_BASE}/app/onboarding?mode=signin`, { waitUntil: "domcontentloaded" });
    const email = page.getByLabel("Work email");
    const pass = page.locator('input[autocomplete="current-password"]');
    await email.waitFor();
    await pass.waitFor();
    if (DRY) {
      await email.fill("you@firm.com");
      await caption("DRY RUN: sign-in fields found. Nothing submitted.");
      await pause(1500);
      return;
    }
    await email.fill(EMAIL);
    await pass.fill(PASSWORD);
    await pause();
    await page.getByTestId("account-continue").click();
    await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 45_000 });
    if (/onboarding/.test(page.url())) throw new Error("Signed in but the firm is not set up yet. Finish firm setup once by hand, then run again.");
    await pause(1500);
  });
  if (DRY) throw Object.assign(new Error("dry run complete"), { dry: true });

  /* 2. Add the client, or open it if it exists */
  await step("add-client", `Add the client: ${CLIENT}`, async () => {
    await page.goto(`${URL_BASE}/app/clients`, { waitUntil: "domcontentloaded" });
    await pause(1500);
    const existing = page.getByText(CLIENT, { exact: false }).first();
    if (await existing.isVisible().catch(() => false)) {
      await existing.click();
    } else {
      await page.getByRole("button", { name: /Add client/ }).first().click();
      await page.locator("#client-name").fill(CLIENT);
      await pause();
      await page.getByRole("button", { name: /^Add client$/ }).last().click();
      await pause(1500);
      await page.getByText(CLIENT, { exact: false }).first().click();
    }
    await page.getByRole("tab", { name: /Documents/ }).first().waitFor();
    await pause(1200);
  });

  /* 3. Upload */
  await step("upload", "Hand over the documents: bank statements, Tally books, loan statements", async () => {
    await tab("Documents").click();
    await pause(1000);
    const present = FILES.filter(([, f]) => existsSync(path.join(FILES_DIR, f)));
    const missing = FILES.filter(([, f]) => !existsSync(path.join(FILES_DIR, f))).map(([, f]) => f);
    if (missing.length) console.warn("Missing files, skipped:\n  " + missing.join("\n  "));
    if (!present.length) throw new Error("None of the expected files were found in FILES_DIR.");
    const input = page.locator('input[type="file"]').first();
    for (const [what, f] of present) {
      await caption(`Uploading: ${what}`);
      await input.setInputFiles(path.join(FILES_DIR, f));
      await sleep(2500);
    }
    await caption("FynHelp reads each file and works out what it is");
    await page
      .waitForFunction(() => /Processing\s*0\b/.test(document.body.innerText) && /Queued\s*0\b/.test(document.body.innerText), null, { timeout: 240_000 })
      .catch(() => console.warn("Files were still processing after 4 minutes; carrying on."));
    await pause(2000);
  });

  /* 4. A statement, proved */
  await step("statement-proof", "Each statement is checked against the bank's own totals", async () => {
    await page.getByText("Indian Bank CA 7856871247", { exact: false }).first().click();
    await pause(4500);
    await page.keyboard.press("Escape");
    await pause();
  });

  /* 5. Review queue */
  await step("review-queue", "Only rows the reader was unsure of wait here for a person", async () => {
    await tab("Review Queue").click();
    await pause(3500);
  });

  /* 6. Reconciliation */
  await step("recon", "Reconciliation starts by itself once the books are in", async () => {
    await tab("Recon").click();
    await pause(5000);
    await page.mouse.wheel(0, 500);
    await pause(3000);
  });

  /* 7. Exceptions */
  await step("exceptions", "What does not match stays visible, with the reason, for a person to decide", async () => {
    await tab("Exception Queue").click();
    await pause(5000);
  });

  /* 8. Data needed and month-end close */
  await step("data-needed", "FynHelp names the files still missing for each check", async () => {
    await tab("Data needed").click();
    await pause(4500);
  });
  await step("month-end-close", "The close checklist: five steps ticked by FynHelp, the rest confirmed by people", async () => {
    await tab("Month-end close").click();
    await pause(5500);
    await page.mouse.wheel(0, 700);
    await pause(3500);
  });

  /* 9. Generate the MIS: try months from MIS_FROM backwards until one has matched transactions */
  let generated = false;
  await step("generate-mis", "Draft the monthly MIS from matched lines only", async () => {
    await tab("MIS").click();
    await pause(1500);
    await page.getByRole("button", { name: /Generate MIS/ }).first().click();
    const dialog = page.getByRole("dialog").first();
    const select = dialog.locator("select").first();
    await select.waitFor();
    const labels = (await select.locator("option").allTextContents()).map((s) => s.trim());
    const fy = labels.filter((l) => /^(April|May|June|July|August|September|October|November|December|January|February|March) (2025|2026)$/.test(l));
    const start = Math.max(0, fy.indexOf(MIS_FROM));
    for (const label of fy.slice(start)) {
      await select.selectOption({ label });
      await sleep(600);
      const basis = (await dialog.getByTestId("mis-basis").textContent().catch(() => "")) ?? "";
      if (/matched transaction/.test(basis) && !/Nothing/.test(basis)) {
        await caption(`${label}: ${basis.trim().slice(0, 70)}`);
        await pause(1800);
        await dialog.getByRole("button", { name: /^Generate$/ }).click();
        generated = true;
        break;
      }
    }
    if (!generated) throw new Error("No financial-year month has matched transactions yet. Check the Recon tab.");
    await page.waitForURL(/\/app\/reports\//, { timeout: 120_000 });
    await pause(2500);
  });

  /* 10. Open a figure, then sign off */
  if (generated) {
    await step("source-lines", "Every figure opens the transactions behind it", async () => {
      await page.getByText(/Click to open/).first().click();
      await pause(4500);
    });
    await step("sign-off", "The partner signs off, or sends it back with a note", async () => {
      await page.getByRole("button", { name: /^Sign off/ }).first().click();
      await pause(1500);
      const ack = page.getByLabel(/I have checked these/);
      if (await ack.isVisible().catch(() => false)) await ack.check();
      await pause(800);
      await page.getByRole("button", { name: /Confirm sign off/ }).click();
      await page.getByText(/signed off/i).first().waitFor({ timeout: 30_000 });
      await pause(3000);
    });
    await step("export", "Export the signed-off MIS as PDF and Excel", async () => {
      for (const kind of ["PDF", "Excel"]) {
        const dl = page.waitForEvent("download", { timeout: 60_000 });
        await page.getByRole("button", { name: new RegExp(`^${kind}$`) }).first().click();
        const file = await dl;
        await file.saveAs(path.join(OUT, `MIS-${kind}-${file.suggestedFilename()}`));
        await pause(1500);
      }
    });
  }

  await caption("Agents prepare. The partner decides and signs off.");
  await pause(3500);
} catch (e) {
  if (!e?.dry) results.push({ name: "run", ok: false, why: String(e?.message ?? e).split("\n")[0] });
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  try {
    const src = video ? await video.path() : null;
    if (src && existsSync(src)) {
      const dest = path.join(OUT, DRY ? "dry-run.webm" : "client-flow.webm");
      renameSync(src, dest);
      console.log(`\nVideo: ${dest}`);
    } else {
      const any = readdirSync(OUT).find((f) => f.endsWith(".webm"));
      if (any) console.log(`\nVideo: ${path.join(OUT, any)}`);
    }
  } catch (e) {
    console.warn("Could not move the video:", e?.message ?? e);
  }
  console.log("\nSteps");
  for (const r of results) console.log(`  ${r.ok ? "ok    " : "FAILED"} ${r.name}${r.secs != null ? ` (${r.secs}s)` : ""}${r.ok ? "" : `: ${r.why}`}`);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}
