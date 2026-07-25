import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, ConsoleMessage, Page, Request } from "playwright";
import { chromium } from "playwright";
import type { ClientToolDefinition, ToolRunResult } from "../types.js";

const ARTIFACT_DIR = join(homedir(), ".letta", "cowork-tools", "browser-artifacts");
const MAX_TEXT = 24_000;
const DEFAULT_ALLOWED_ORIGINS = ["http://localhost", "http://127.0.0.1", "http://0.0.0.0"];

type BrowserState = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  consoleMessages: Array<{ type: string; text: string; location?: string; time: string }>;
  networkRequests: Array<{ method: string; url: string; status?: number; failure?: string; resourceType: string; time: string }>;
};

let state: BrowserState | null = null;

function ok(output: string): ToolRunResult {
  return { output, isError: false };
}

function fail(error: unknown): ToolRunResult {
  return { output: error instanceof Error ? error.message : String(error), isError: true };
}

function truncate(value: string, max = MAX_TEXT): string {
  return value.length > max ? `${value.slice(0, max)}\n[truncated to ${max} chars]` : value;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function assertAllowedUrl(url: string, allowExternal: boolean): void {
  const parsed = new URL(url);
  if (allowExternal) return;
  const origin = parsed.origin;
  if (!DEFAULT_ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed))) {
    throw new Error(`Browser navigation is limited to localhost by default. Pass allowExternal=true only when the user explicitly approves external browsing. Blocked URL: ${url}`);
  }
}

async function ensureState(options?: { headless?: boolean; width?: number; height?: number }): Promise<BrowserState> {
  if (state) return state;

  // Cowork is a desktop app, so default to a headed Chromium window. This gives
  // the user a live preview of what the agent is testing. Agents can still pass
  // headless=true for background/CI-style checks.
  const browser = await chromium.launch({ headless: options?.headless ?? false });
  const context = await browser.newContext({
    viewport: { width: options?.width ?? 1280, height: options?.height ?? 800 },
  });
  const page = await context.newPage();
  const consoleMessages: BrowserState["consoleMessages"] = [];
  const networkRequests: BrowserState["networkRequests"] = [];

  page.on("console", (message: ConsoleMessage) => {
    const location = message.location();
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: location.url ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined,
      time: new Date().toISOString(),
    });
    if (consoleMessages.length > 500) consoleMessages.shift();
  });

  page.on("requestfinished", async (request: Request) => {
    const response = await request.response().catch(() => null);
    networkRequests.push({
      method: request.method(),
      url: request.url(),
      status: response?.status(),
      resourceType: request.resourceType(),
      time: new Date().toISOString(),
    });
    if (networkRequests.length > 500) networkRequests.shift();
  });

  page.on("requestfailed", (request: Request) => {
    networkRequests.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText,
      resourceType: request.resourceType(),
      time: new Date().toISOString(),
    });
    if (networkRequests.length > 500) networkRequests.shift();
  });

  state = { browser, context, page, consoleMessages, networkRequests };
  return state;
}

async function closeBrowser(): Promise<void> {
  const current = state;
  state = null;
  if (current) await current.browser.close();
}

function locatorFor(page: Page, target: string) {
  const trimmed = target.trim();
  if (!trimmed) throw new Error("target is required");
  if (trimmed.startsWith("text=")) return page.getByText(trimmed.slice(5), { exact: false }).first();
  const roleMatch = /^role=([a-zA-Z0-9_-]+)(?:\[name=(.+)\])?$/.exec(trimmed);
  if (roleMatch) {
    const role = roleMatch[1] as Parameters<Page["getByRole"]>[0];
    const name = roleMatch[2];
    return page.getByRole(role, name ? { name } : undefined).first();
  }
  return page.locator(trimmed).first();
}

async function pageSnapshot(page: Page): Promise<string> {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  const interactive = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("a,button,input,textarea,select,[role],[data-testid]")).slice(0, 120);
    return nodes.map((node) => {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || el.id || "";
      const testId = el.getAttribute("data-testid");
      const role = el.getAttribute("role");
      const disabled = el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
      const selector = testId ? `[data-testid=\"${testId}\"]` : el.id ? `#${el.id}` : tag;
      return { tag, role, label: label.trim().slice(0, 120), selector, disabled };
    });
  }).catch(() => []);

  return truncate(JSON.stringify({ title, url, interactive, text: bodyText.slice(0, 12_000) }, null, 2));
}

async function saveScreenshot(page: Page, requestedName?: string, fullPage = false): Promise<string> {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const safeName = (requestedName || `browser-${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = join(ARTIFACT_DIR, safeName.endsWith(".png") ? safeName : `${safeName}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

export const browserTools: ClientToolDefinition[] = [
  {
    name: "BrowserNavigate",
    description: "Open a URL in Cowork's built-in Playwright browser with a visible live preview by default. Defaults to localhost-only unless allowExternal is explicitly true.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open. Localhost URLs are allowed by default." },
        allowExternal: { type: "boolean", description: "Set true only after explicit user approval to browse non-localhost URLs." },
        headless: { type: "boolean", description: "Run browser headlessly instead of showing the live preview. Defaults to false." },
        width: { type: "number", description: "Viewport width. Defaults to 1280." },
        height: { type: "number", description: "Viewport height. Defaults to 800." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    async run(args) {
      try {
        const url = asString(args.url);
        if (!url) throw new Error("url is required");
        assertAllowedUrl(url, asBoolean(args.allowExternal));
        const current = await ensureState({ headless: asBoolean(args.headless, false), width: asNumber(args.width, 1280), height: asNumber(args.height, 800) });
        await current.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        return ok(`Opened ${current.page.url()}\n\n${await pageSnapshot(current.page)}`);
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserSnapshot",
    description: "Return a compact snapshot of the current browser page including visible text and interactive elements.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      try {
        const current = await ensureState();
        return ok(await pageSnapshot(current.page));
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserClick",
    description: "Click an element in the current browser page. Use CSS selectors, text=<visible text>, or role=button[name=Save].",
    parameters: {
      type: "object",
      properties: { target: { type: "string", description: "CSS selector, text=..., or role=...[name=...] target." } },
      required: ["target"],
      additionalProperties: false,
    },
    async run(args) {
      try {
        const current = await ensureState();
        const target = asString(args.target);
        await locatorFor(current.page, target).click({ timeout: 5_000 });
        return ok(`Clicked ${target}\n\n${await pageSnapshot(current.page)}`);
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserType",
    description: "Type or fill text into an element. Use CSS selectors, text=<visible text>, or role=... targets.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string" },
        text: { type: "string" },
        submit: { type: "boolean", description: "Press Enter after typing." },
        append: { type: "boolean", description: "Append by typing instead of replacing with fill." },
      },
      required: ["target", "text"],
      additionalProperties: false,
    },
    async run(args) {
      try {
        const current = await ensureState();
        const target = asString(args.target);
        const text = asString(args.text);
        const locator = locatorFor(current.page, target);
        if (asBoolean(args.append)) await locator.type(text, { timeout: 5_000 });
        else await locator.fill(text, { timeout: 5_000 });
        if (asBoolean(args.submit)) await locator.press("Enter", { timeout: 5_000 });
        return ok(`Entered text into ${target}\n\n${await pageSnapshot(current.page)}`);
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserWaitFor",
    description: "Wait for text to appear on the current page or for a number of seconds.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Visible text to wait for." },
        seconds: { type: "number", description: "Seconds to wait. Defaults to 2." },
      },
      additionalProperties: false,
    },
    async run(args) {
      try {
        const current = await ensureState();
        const text = asString(args.text);
        const seconds = Math.min(Math.max(asNumber(args.seconds, 2), 0.1), 30);
        if (text) await current.page.getByText(text, { exact: false }).first().waitFor({ timeout: seconds * 1000 });
        else await current.page.waitForTimeout(seconds * 1000);
        return ok(`Waited${text ? ` for text ${JSON.stringify(text)}` : ` ${seconds}s`}\n\n${await pageSnapshot(current.page)}`);
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserTakeScreenshot",
    description: "Save a screenshot of the current browser page and return the local image path.",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Optional filename under the Cowork browser artifact directory." },
        fullPage: { type: "boolean", description: "Capture full scrollable page." },
      },
      additionalProperties: false,
    },
    async run(args) {
      try {
        const current = await ensureState();
        const file = await saveScreenshot(current.page, asString(args.filename), asBoolean(args.fullPage));
        return ok(`Screenshot saved: ${file}`);
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserConsoleMessages",
    description: "Return console messages captured from the current browser session.",
    parameters: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["all", "error", "warning", "info", "debug"], description: "Minimum/selected level. Defaults to all." },
      },
      additionalProperties: false,
    },
    async run(args) {
      try {
        const current = await ensureState();
        const level = asString(args.level, "all");
        const messages = current.consoleMessages.filter((item) => level === "all" || item.type === level);
        return ok(truncate(JSON.stringify(messages.slice(-100), null, 2)));
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserNetworkRequests",
    description: "Return recent network requests captured from the current browser session.",
    parameters: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Optional substring filter for request URLs." },
        includeStatic: { type: "boolean", description: "Include images/fonts/styles/scripts. Defaults to false." },
      },
      additionalProperties: false,
    },
    async run(args) {
      try {
        const current = await ensureState();
        const filter = asString(args.filter);
        const includeStatic = asBoolean(args.includeStatic);
        const staticTypes = new Set(["image", "font", "stylesheet", "script"]);
        const requests = current.networkRequests
          .filter((request) => includeStatic || !staticTypes.has(request.resourceType))
          .filter((request) => !filter || request.url.includes(filter))
          .slice(-100);
        return ok(truncate(JSON.stringify(requests, null, 2)));
      } catch (error) {
        return fail(error);
      }
    },
  },
  {
    name: "BrowserClose",
    description: "Close Cowork's built-in Playwright browser session.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async run() {
      try {
        await closeBrowser();
        return ok("Browser session closed.");
      } catch (error) {
        return fail(error);
      }
    },
  },
];
