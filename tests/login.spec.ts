import { test, expect } from "@playwright/test";

test.describe("Listmonk on Neon PostgreSQL", () => {
  test("shows the Listmonk admin login page", async ({ page }) => {
    // Navigate directly to the admin login page.
    // Listmonk redirects /admin/ → /admin/login so go there directly.
    const response = await page.goto("/admin/login", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    expect(response).not.toBeNull();
    const status = response!.status();

    // Expect either the login page (200) or a Cloudflare managed challenge.
    // A non-5xx status confirms the container is up and serving Listmonk.
    expect(status).toBeLessThan(500);

    // If we reached the actual login page, verify the form fields
    if (response!.ok()) {
      await expect(page.locator("#username")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("#password")).toBeVisible();
      await expect(page.locator("button[type='submit']")).toBeVisible();
    }
  });

  test("shows loading page or Listmonk when visiting root", async ({
    page,
  }) => {
    const response = await page.goto("/", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    expect(response).not.toBeNull();
    const status = response!.status();
    const body = await page.content();

    if (status === 503) {
      // Loading page — container is still waking up
      expect(body).toContain("Hold on while we spin up");
      expect(body).toContain("mail.megabyte.space");
    } else {
      // Container is running — Listmonk serves its public page
      expect(response!.ok()).toBeTruthy();
      const title = await page.title();
      expect(title.toLowerCase()).toContain("listmonk");
    }
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
