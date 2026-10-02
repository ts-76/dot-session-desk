import api from "../lib/server/http";
import handler from "vinext/server/fetch-handler";
import type { Env } from "../lib/server/data";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") || path === "/mcp" || path === "/bridge")
      return api.fetch(request, env, ctx);
    return handler.fetch(request, env, ctx);
  },
};
