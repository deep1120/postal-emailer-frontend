import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const args = new Set(process.argv.slice(2));
const port = Number(process.env.PORT || 4173);
const outPath = process.env.SCREENSHOT_PATH || (args.has("--before") ? "artifacts/before.png" : "artifacts/after.png");

const waitForServer = (url, timeoutMs = 10000) => new Promise((resolveWait, reject) => {
  const start = Date.now();
  const attempt = async () => {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return resolveWait();
    } catch (err) {
      // ignore
    }
    if (Date.now() - start > timeoutMs) {
      reject(new Error(`Server did not respond within ${timeoutMs}ms`));
      return;
    }
    setTimeout(attempt, 250);
  };
  attempt();
});

const run = async () => {
  await mkdir("artifacts", { recursive: true });

  const server = spawn("npx", ["--yes", "http-server", ".", "-p", String(port), "-c-1"], {
    stdio: "ignore",
  });

  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(url);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.goto(url, { waitUntil: "networkidle" });

    await page.fill("#username", "staff1");
    await page.fill("#password", "Postal11011");
    await page.click("#loginBtn");

    await page.waitForSelector("#tbody tr", { timeout: 15000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: resolve(outPath), fullPage: true });
    await browser.close();
  } finally {
    server.kill();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
