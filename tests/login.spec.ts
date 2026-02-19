import { test, expect } from "@playwright/test";

test.describe("Listmonk on Neon PostgreSQL", () => {
  test("serves the Listmonk application from the container", async ({
    page,
  }) => {
    // Navigate to the public page — Listmonk serves a subscription/mailing list page
    const response = await page.goto("/", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    expect(response).not.toBeNull();
    expect(response!.ok()).toBeTruthy();

    // Verify the page contains Listmonk-specific content
    // This confirms the container is running and connected to Neon PostgreSQL
    const title = await page.title();
    expect(title.toLowerCase()).toContain("listmonk");

    // Check for key Listmonk elements
    const body = await page.content();
    expect(body).toContain("listmonk");
    expect(body).toContain("Mailing list");
  });

  test("health endpoint returns neon-postgresql database", async ({ page }) => {
    const response = await page.goto("/__health", {
      waitUntil: "domcontentloaded",
    });
    expect(response).not.toBeNull();
    expect(response!.ok()).toBeTruthy();

    const body = JSON.parse(await page.innerText("body"));
    expect(body.status).toBe("healthy");
    expect(body.database).toBe("neon-postgresql");
    expect(body.container).toBe("listmonk");
  });

  test("version endpoint returns neon-postgresql database", async ({
    page,
  }) => {
    const response = await page.goto("/__version", {
      waitUntil: "domcontentloaded",
    });
    expect(response).not.toBeNull();
    expect(response!.ok()).toBeTruthy();

    const body = JSON.parse(await page.innerText("body"));
    expect(body.database).toBe("neon-postgresql");
    expect(body.runtime).toBe("cloudflare-containers");
  });
});
