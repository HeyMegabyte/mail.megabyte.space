import { Container } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

interface Env {
  LISTMONK: DurableObjectNamespace;
  DB_HOST: string;
  DB_PORT: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_SSL_MODE: string;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
}

export class ListmonkContainer extends Container<Env> {
  defaultPort = 9000;
  sleepAfter = "30m";
  enableInternet = true;
  envVars = {
    LISTMONK_app__address: "0.0.0.0:9000",
    LISTMONK_app__root_url: "https://mail.megabyte.space",
    LISTMONK_db__host: (env as unknown as Env).DB_HOST,
    LISTMONK_db__port: (env as unknown as Env).DB_PORT,
    LISTMONK_db__user: (env as unknown as Env).DB_USER,
    LISTMONK_db__password: (env as unknown as Env).DB_PASSWORD,
    LISTMONK_db__database: (env as unknown as Env).DB_NAME,
    LISTMONK_db__ssl_mode: (env as unknown as Env).DB_SSL_MODE,
    LISTMONK_db__max_open: "25",
    LISTMONK_db__max_idle: "25",
    LISTMONK_db__max_lifetime: "300s",
    LISTMONK_ADMIN_USER: (env as unknown as Env).ADMIN_USER || "admin",
    LISTMONK_ADMIN_PASSWORD: (env as unknown as Env).ADMIN_PASSWORD || "admin",
    LISTMONK_ADMIN_API_USER: "api_admin",
  };

  override async fetch(request: Request): Promise<Response> {
    try {
      // Buffer the request body to avoid stream-related issues
      let bodyContent: ArrayBuffer | null = null;
      if (request.body) {
        bodyContent = await request.arrayBuffer();
      }

      const response = await this.containerFetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: bodyContent,
        redirect: "manual",
      } as RequestInit, this.defaultPort);

      // Read the response body fully and create a fresh response
      const body = await response.arrayBuffer();
      const newHeaders = new Headers(response.headers);
      newHeaders.set("X-Container-Override", "true");

      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      console.error("ListmonkContainer.fetch error:", error);
      return new Response(
        `Container error: ${error instanceof Error ? error.message : String(error)}`,
        { status: 502, headers: { "X-Container-Override": "error" } },
      );
    }
  }

  override onStart(): void {
    console.log("Listmonk container started");
  }

  override onStop(): void {
    console.log("Listmonk container stopped");
  }

  override onError(error: unknown): void {
    console.error("Listmonk container error:", error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const id = env.LISTMONK.idFromName("listmonk-v11");
      const stub = env.LISTMONK.get(id);
      return await stub.fetch(request);
    } catch (error: unknown) {
      console.error("Worker top-level error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return new Response(`Worker error: ${msg}`, { status: 502 });
    }
  },
};
