import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./client.server";
import fs from "node:fs";
import path from "node:path";

function ensureEnvLoaded() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) return;
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {}
}

export function isMockAuthAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    ensureEnvLoaded();
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in your .env file.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    if (token.startsWith("mock-")) {
      if (!isMockAuthAllowed()) {
        throw new Error(
          "Unauthorized: Mock authentication tokens are not allowed in this environment",
        );
      }

      let mockUserId = "3577b1a6-5c6e-4e67-b09a-e0e97ab92739";
      let mockEmail = "admin@pelecanon.local";

      if (token.includes("worker")) {
        mockUserId = "22222222-2222-2222-2222-222222222222";
        mockEmail = "worker@pelecanon.local";
      } else if (token.includes("warehouse")) {
        mockUserId = "44444444-4444-4444-4444-444444444444";
        mockEmail = "warehouse_user@pelecanon.local";
      } else if (token.includes("manager")) {
        mockUserId = "22222222-2222-2222-2222-222222222221";
        mockEmail = "manager1@pelecanon.local";
      }

      const { data } = await supabaseAdmin.auth.getClaims(token).catch(() => ({ data: null }));
      return next({
        context: {
          supabase: supabaseAdmin,
          userId: mockUserId,
          claims: (data?.claims ?? {
            sub: mockUserId,
            aud: "authenticated",
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
            iss: "supabase",
            role: "authenticated",
            email: mockEmail,
            app_metadata: {},
            user_metadata: {},
          }) as NonNullable<typeof data>["claims"],
        },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Error("Unauthorized: Invalid token");
    }

    if (!data.claims.sub) {
      throw new Error("Unauthorized: No user ID found in token");
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
