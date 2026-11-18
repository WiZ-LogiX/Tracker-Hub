import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let currentMockRequest: any = null;

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => currentMockRequest,
}));

import { isMockAuthAllowed, requireSupabaseAuth } from "./auth-middleware";

describe("auth-middleware: Fail-Close Mock Bearer Token Security", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    currentMockRequest = null;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    currentMockRequest = null;
  });

  describe("isMockAuthAllowed() allowlist validation", () => {
    it("allows mock auth in development environment", () => {
      expect(isMockAuthAllowed({ NODE_ENV: "development" } as any)).toBe(true);
    });

    it("allows mock auth in test environment", () => {
      expect(isMockAuthAllowed({ NODE_ENV: "test" } as any)).toBe(true);
    });

    it("strictly rejects mock auth in production environment", () => {
      expect(isMockAuthAllowed({ NODE_ENV: "production" } as any)).toBe(false);
    });

    it("strictly rejects mock auth when NODE_ENV is undefined (fails close)", () => {
      expect(isMockAuthAllowed({} as any)).toBe(false);
      expect(isMockAuthAllowed({ NODE_ENV: undefined } as any)).toBe(false);
    });

    it("strictly rejects mock auth in unknown or staging environments", () => {
      expect(isMockAuthAllowed({ NODE_ENV: "staging" } as any)).toBe(false);
      expect(isMockAuthAllowed({ NODE_ENV: "preview" } as any)).toBe(false);
      expect(isMockAuthAllowed({ NODE_ENV: "" } as any)).toBe(false);
    });
  });

  describe("requireSupabaseAuth middleware mock token rejection", () => {
    it("rejects Bearer mock-... token when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";

      currentMockRequest = {
        headers: new Headers({
          authorization: "Bearer mock-admin-token",
        }),
      };

      const serverHandler = (requireSupabaseAuth as any).options?.server;
      expect(serverHandler).toBeDefined();

      const nextFn = vi.fn();
      await expect(serverHandler({ next: nextFn })).rejects.toThrow(
        "Unauthorized: Mock authentication tokens are not allowed in this environment",
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("rejects Bearer mock-... token when NODE_ENV is undefined", async () => {
      delete process.env.NODE_ENV;

      currentMockRequest = {
        headers: new Headers({
          authorization: "Bearer mock-worker-token",
        }),
      };

      const serverHandler = (requireSupabaseAuth as any).options?.server;
      expect(serverHandler).toBeDefined();

      const nextFn = vi.fn();
      await expect(serverHandler({ next: nextFn })).rejects.toThrow(
        "Unauthorized: Mock authentication tokens are not allowed in this environment",
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it("allows Bearer mock-... token when NODE_ENV is test", async () => {
      process.env.NODE_ENV = "test";

      currentMockRequest = {
        headers: new Headers({
          authorization: "Bearer mock-admin-token",
        }),
      };

      const serverHandler = (requireSupabaseAuth as any).options?.server;
      expect(serverHandler).toBeDefined();

      let capturedContext: any = null;
      const nextFn = vi.fn().mockImplementation(({ context }) => {
        capturedContext = context;
        return { success: true };
      });

      const res = await serverHandler({ next: nextFn });
      expect(nextFn).toHaveBeenCalled();
      expect(capturedContext?.userId).toBe("3577b1a6-5c6e-4e67-b09a-e0e97ab92739");
      expect(capturedContext?.claims?.email).toBe("admin@pelecanon.local");
      expect(res).toEqual({ success: true });
    });
  });
});
