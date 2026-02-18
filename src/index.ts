/**
 * @fileoverview Cloudflare Worker + Durable Object Container for Listmonk
 *
 * Deploys [Listmonk](https://listmonk.app/) — a high-performance, self-hosted
 * newsletter and mailing list manager — on Cloudflare Containers backed by
 * Supabase PostgreSQL.
 *
 * ## Architecture
 *
 * ```
 * Internet ──► Cloudflare Worker (Edge) ──► Durable Object ──► Listmonk Container
 *                                                                    │
 *                                                              Supabase PostgreSQL
 * ```
 *
 * The Worker acts as an intelligent reverse proxy that:
 * 1. Routes all inbound requests to a single Durable Object instance
 * 2. The Durable Object manages a persistent Listmonk Docker container
 * 3. The container connects to Supabase PostgreSQL over TLS
 * 4. The container auto-sleeps after 30 minutes of inactivity
 *
 * ## Error Handling Strategy
 *
 * - **L1 (Container):** Catches fetch errors, returns structured JSON errors
 * - **L2 (Worker):** Catches Durable Object communication failures
 * - All errors include request IDs for traceability
 * - Health check endpoint (`/__health`) bypasses the container entirely
 *
 * @module listmonk-mail
 * @version 2.0.0
 * @license MIT
 * @see {@link https://github.com/HeyMegabyte/mail.megabyte.space}
 */

import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Current deployment version — bump on each release. */
const VERSION = "2.1.0";

/** Stable Durable Object name for singleton routing. */
const DURABLE_OBJECT_NAME = "listmonk-v11";

/** HTTP status codes used throughout the worker. */
const HTTP = {
  OK: 200,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/** Maximum time (ms) to wait for a container response before timing out. */
const CONTAINER_TIMEOUT_MS = 30_000;

/** Headers added to every response for observability. */
const STANDARD_HEADERS = {
  "X-Powered-By": "Cloudflare Containers",
  "X-App-Version": VERSION,
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Environment bindings injected by the Cloudflare Workers runtime.
 *
 * These are configured in `wrangler.jsonc` under `vars` and `secrets`.
 *
 * | Variable         | Source            | Description                               |
 * | ---------------- | ----------------- | ----------------------------------------- |
 * | `LISTMONK`       | Durable Object    | Namespace binding for the container DO     |
 * | `APP_DOMAIN`     | `vars`            | Public domain (e.g. `mail.megabyte.space`) |
 * | `DB_HOST`        | `vars`            | Supabase PostgreSQL host                   |
 * | `DB_PORT`        | `vars`            | Database port (default: `5432`)            |
 * | `DB_USER`        | `vars`            | Database user (default: `postgres`)        |
 * | `DB_PASSWORD`    | `secrets`         | Database password (set via wrangler CLI)   |
 * | `DB_NAME`        | `vars`            | Database name (default: `postgres`)        |
 * | `DB_SSL_MODE`    | `vars`            | SSL mode (default: `require`)              |
 * | `ADMIN_USER`     | `vars`            | Listmonk admin username                    |
 * | `ADMIN_PASSWORD` | `vars` / `secrets`| Listmonk admin password                    |
 */
export interface Env {
  /** Durable Object namespace for the Listmonk container. */
  readonly LISTMONK: DurableObjectNamespace;
  /** Public-facing domain name for the application. */
  readonly APP_DOMAIN: string;
  /** Supabase PostgreSQL hostname. */
  readonly DB_HOST: string;
  /** Database port number. */
  readonly DB_PORT: string;
  /** Database username. */
  readonly DB_USER: string;
  /** Database password — should be set as a Wrangler secret. */
  readonly DB_PASSWORD: string;
  /** Database name. */
  readonly DB_NAME: string;
  /** PostgreSQL SSL mode (`require`, `verify-full`, etc.). */
  readonly DB_SSL_MODE: string;
  /** Listmonk admin panel username. */
  readonly ADMIN_USER: string;
  /** Listmonk admin panel password. */
  readonly ADMIN_PASSWORD: string;
}

/**
 * Structured JSON error response returned on failures.
 *
 * @example
 * ```json
 * {
 *   "error": "Container fetch failed",
 *   "code": "CONTAINER_FETCH_ERROR",
 *   "request_id": "abc123",
 *   "timestamp": "2026-01-15T10:30:00.000Z",
 *   "version": "2.0.0"
 * }
 * ```
 */
interface ErrorResponse {
  readonly error: string;
  readonly code: string;
  readonly request_id: string;
  readonly timestamp: string;
  readonly version: string;
}

/**
 * Health check response from `/__health`.
 *
 * @example
 * ```json
 * {
 *   "status": "healthy",
 *   "version": "2.0.0",
 *   "container": "listmonk",
 *   "database": "supabase-postgresql",
 *   "uptime": "running",
 *   "timestamp": "2026-01-15T10:30:00.000Z"
 * }
 * ```
 */
interface HealthResponse {
  readonly status: "healthy" | "degraded";
  readonly version: string;
  readonly container: string;
  readonly database: string;
  readonly domain: string;
  readonly uptime: string;
  readonly timestamp: string;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Generates a short unique request ID for tracing.
 *
 * @returns An 8-character hex string derived from `crypto.randomUUID()`.
 */
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

/**
 * Builds a structured JSON error {@link Response}.
 *
 * @param message - Human-readable error description.
 * @param code - Machine-readable error code (e.g. `CONTAINER_FETCH_ERROR`).
 * @param status - HTTP status code for the response.
 * @param requestId - Request ID for correlation.
 * @returns A {@link Response} with `Content-Type: application/json`.
 */
function buildErrorResponse(
  message: string,
  code: string,
  status: number,
  requestId: string,
): Response {
  const body: ErrorResponse = {
    error: message,
    code,
    request_id: requestId,
    timestamp: new Date().toISOString(),
    version: VERSION,
  };
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...STANDARD_HEADERS,
    },
  });
}

/**
 * Adds standard headers and security headers to an outgoing response.
 *
 * @param response - The original {@link Response} from the container.
 * @param requestId - Request ID for correlation.
 * @returns A new {@link Response} with augmented headers.
 */
function augmentResponse(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  headers.set("X-Container-Proxied", "true");
  for (const [key, value] of Object.entries(STANDARD_HEADERS)) {
    headers.set(key, value);
  }
  // Security headers
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ─── Durable Object: Listmonk Container ─────────────────────────────────────

/**
 * Durable Object that manages a single Listmonk Docker container.
 *
 * This class extends the Cloudflare `Container` base class to:
 * - Inject all required environment variables into the container
 * - Buffer request/response bodies as `ArrayBuffer` to avoid Durable Object
 *   streaming issues
 * - Add structured error handling with request ID tracing
 * - Log container lifecycle events for observability
 *
 * ### Container Configuration
 *
 * | Setting            | Value                          | Notes                              |
 * | ------------------ | ------------------------------ | ---------------------------------- |
 * | Port               | `9000`                         | Listmonk default HTTP port         |
 * | Sleep After        | `30m`                          | Container sleeps after 30m idle    |
 * | Internet Access    | `true`                         | Required for SMTP and webhooks     |
 * | Max DB Connections | `25` open / `25` idle          | Tuned for Supabase connection pool |
 * | Connection Lifetime| `300s`                         | 5-minute max lifetime per conn     |
 *
 * @extends Container<Env>
 */
export class ListmonkContainer extends Container<Env> {
  /** The port Listmonk listens on inside the container. */
  override defaultPort = 9000;

  /**
   * Duration of inactivity before the container is automatically stopped.
   * Set to 30 minutes to balance cost savings with responsiveness.
   */
  override sleepAfter = "30m";

  /**
   * Whether the container can make outbound network requests.
   * Must be `true` for Listmonk to send emails via SMTP and connect to the database.
   */
  override enableInternet = true;

  /**
   * Environment variables injected into the Listmonk container at startup.
   *
   * All `LISTMONK_*` variables follow Listmonk's
   * [environment variable configuration](https://listmonk.app/docs/configuration/#environment-variables)
   * format where double underscores (`__`) represent nested TOML keys.
   */
  override envVars = {
    // ── Application ──
    LISTMONK_app__address: "0.0.0.0:9000",
    LISTMONK_app__root_url: `https://${(env as unknown as Env).APP_DOMAIN}`,

    // ── Database ──
    LISTMONK_db__host: (env as unknown as Env).DB_HOST,
    LISTMONK_db__port: (env as unknown as Env).DB_PORT,
    LISTMONK_db__user: (env as unknown as Env).DB_USER,
    LISTMONK_db__password: (env as unknown as Env).DB_PASSWORD,
    LISTMONK_db__database: (env as unknown as Env).DB_NAME,
    LISTMONK_db__ssl_mode: (env as unknown as Env).DB_SSL_MODE,

    // ── Connection Pool ──
    LISTMONK_db__max_open: "25",
    LISTMONK_db__max_idle: "25",
    LISTMONK_db__max_lifetime: "300s",

    // ── Admin ──
    LISTMONK_ADMIN_USER: (env as unknown as Env).ADMIN_USER || "admin",
    LISTMONK_ADMIN_PASSWORD: (env as unknown as Env).ADMIN_PASSWORD || "admin",
    LISTMONK_ADMIN_API_USER: "api_admin",
  };

  /**
   * Intercepts all inbound HTTP requests and proxies them to the container.
   *
   * This override is necessary because the Durable Object runtime does not
   * support streaming request bodies reliably. The workaround:
   * 1. Buffer the entire request body as an `ArrayBuffer`
   * 2. Forward to the container via `containerFetch()`
   * 3. Buffer the response body to avoid stream-related crashes
   * 4. Augment the response with tracing and security headers
   *
   * @param request - The inbound HTTP request from the Worker.
   * @returns The proxied response from the Listmonk container.
   *
   * @throws Will return a 502 JSON error response if the container is unreachable.
   * @throws Will return a 504 JSON error response if the request times out.
   */
  override async fetch(request: Request): Promise<Response> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const { method, url } = request;
    const pathname = new URL(url).pathname;

    console.log(
      `[${requestId}] ${method} ${pathname} — forwarding to container`,
    );

    try {
      // Buffer request body to avoid Durable Object streaming issues
      let bodyContent: ArrayBuffer | null = null;
      if (request.body) {
        bodyContent = await request.arrayBuffer();
      }

      // Forward to container with timeout protection
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        CONTAINER_TIMEOUT_MS,
      );

      let response: Response;
      try {
        response = await this.containerFetch(
          url,
          {
            method,
            headers: Object.fromEntries(request.headers.entries()),
            body: bodyContent,
            redirect: "manual",
            signal: controller.signal,
          } as RequestInit,
          this.defaultPort,
        );
      } finally {
        clearTimeout(timeout);
      }

      // Buffer response body to prevent stream errors
      const responseBody = await response.arrayBuffer();
      const duration = Date.now() - startTime;

      console.log(
        `[${requestId}] ${method} ${pathname} — ${response.status} (${duration}ms)`,
      );

      const proxiedResponse = new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });

      return augmentResponse(proxiedResponse, requestId);
    } catch (error) {
      const duration = Date.now() - startTime;

      // Distinguish timeout from other errors
      if (error instanceof DOMException && error.name === "AbortError") {
        console.error(
          `[${requestId}] ${method} ${pathname} — TIMEOUT after ${duration}ms`,
        );
        return buildErrorResponse(
          "Container request timed out",
          "CONTAINER_TIMEOUT",
          HTTP.GATEWAY_TIMEOUT,
          requestId,
        );
      }

      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[${requestId}] ${method} ${pathname} — ERROR after ${duration}ms: ${message}`,
      );

      return buildErrorResponse(
        `Container error: ${message}`,
        "CONTAINER_FETCH_ERROR",
        HTTP.BAD_GATEWAY,
        requestId,
      );
    }
  }

  /**
   * Called when the container starts. Logs startup for observability.
   */
  override onStart(): void {
    console.log(
      `[container] Listmonk container started (v${VERSION}, domain: ${(env as unknown as Env).APP_DOMAIN})`,
    );
  }

  /**
   * Called when the container stops (e.g., sleep timeout reached).
   */
  override onStop(): void {
    console.log("[container] Listmonk container stopped (sleeping)");
  }

  /**
   * Called when the container encounters an error.
   *
   * @param error - The error that occurred within the container runtime.
   */
  override onError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[container] Listmonk container error: ${message}`);
  }
}

// ─── Worker Entry Point ──────────────────────────────────────────────────────

/**
 * Cloudflare Worker module that routes requests to the Listmonk Durable Object.
 *
 * ### Request Flow
 *
 * 1. `/__health` → Returns a JSON health check (no container needed)
 * 2. `/__version` → Returns version info
 * 3. All other paths → Forwarded to the Listmonk container via the Durable Object
 *
 * ### Error Handling
 *
 * If the Durable Object or container is unreachable, the Worker returns a
 * structured JSON error with a unique request ID for debugging.
 */
export default {
  /**
   * Main fetch handler — the entry point for all HTTP requests.
   *
   * @param request - The inbound HTTP request.
   * @param workerEnv - Environment bindings (vars, secrets, DO namespaces).
   * @returns The response from the container or an error response.
   */
  async fetch(request: Request, workerEnv: Env): Promise<Response> {
    const requestId = generateRequestId();
    const url = new URL(request.url);

    // ── Health Check (bypasses container) ──
    if (url.pathname === "/__health") {
      const health: HealthResponse = {
        status: "healthy",
        version: VERSION,
        container: "listmonk",
        database: "supabase-postgresql",
        domain: workerEnv.APP_DOMAIN,
        uptime: "running",
        timestamp: new Date().toISOString(),
      };
      return new Response(JSON.stringify(health, null, 2), {
        status: HTTP.OK,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          ...STANDARD_HEADERS,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // ── Version Info ──
    if (url.pathname === "/__version") {
      return new Response(
        JSON.stringify(
          {
            version: VERSION,
            container: "listmonk/listmonk:latest",
            runtime: "cloudflare-containers",
            database: "supabase-postgresql",
          },
          null,
          2,
        ),
        {
          status: HTTP.OK,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            ...STANDARD_HEADERS,
          },
        },
      );
    }

    // ── Proxy to Listmonk Container ──
    try {
      const id = workerEnv.LISTMONK.idFromName(DURABLE_OBJECT_NAME);
      const stub = workerEnv.LISTMONK.get(id);
      return await stub.fetch(request);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[${requestId}] Worker error routing to Durable Object: ${message}`,
      );

      return buildErrorResponse(
        `Service temporarily unavailable: ${message}`,
        "DURABLE_OBJECT_ERROR",
        HTTP.SERVICE_UNAVAILABLE,
        requestId,
      );
    }
  },
};
