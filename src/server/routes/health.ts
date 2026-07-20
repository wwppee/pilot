/**
 * v0.9.16: /health route extracted from server.ts.
 *
 * The only unauthenticated route in the server. Used
 * by `pilot doctor`, the dashboard nav header, and
 * external monitors. Returns the running version so
 * `pilot --version` mismatches surface immediately.
 */
import type { FastifyInstance } from "fastify";
import { VERSION } from "../../core/version.js";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({
    status: "ok",
    version: VERSION,
    pid: process.pid,
  }));
}
