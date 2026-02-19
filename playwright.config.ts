import { defineConfig } from "@playwright/test";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

/** Parse proxy URL into Playwright's proxy config format. */
function parseProxy(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return {
      server: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    return undefined;
  }
}

const proxy = parseProxy(proxyUrl);

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  retries: 2,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL || "https://mail.megabyte.space",
    ignoreHTTPSErrors: !!process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS,
    proxy: proxy ?? undefined,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
