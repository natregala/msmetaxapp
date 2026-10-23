import { describe, expect, it, vi } from "vitest";
import {
  readSession,
  requireSession,
} from "../../src/features/auth/server/session";

const fixture = vi.hoisted(() => ({ database: undefined as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fixture.database,
}));

describe("verified session handling with a mocked Auth provider", () => {
  it("returns only the verified identity needed by the application", async () => {
    fixture.database = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "10000000-0000-4000-8000-000000000001",
              email: "synthetic@example.test",
              user_metadata: { ownerId: "forged" },
            },
          },
          error: null,
        }),
      },
    };
    expect((await readSession()).user).toEqual({
      id: "10000000-0000-4000-8000-000000000001",
      email: "synthetic@example.test",
    });
  });

  it("reports absent authentication as signed out and protects required sessions", async () => {
    fixture.database = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { name: "AuthSessionMissingError", status: 400 },
        }),
      },
    };
    expect((await readSession()).user).toBeNull();
    await expect(requireSession()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("does not turn a rate limit into an apparent account change", async () => {
    fixture.database = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { name: "AuthApiError", status: 429 },
        }),
      },
    };
    await expect(readSession()).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it.each([
    { name: "AuthApiError", status: 503 },
    { name: "AuthRetryableFetchError", status: 0 },
  ])(
    "preserves the session distinction when Auth is unavailable: %j",
    async (error) => {
      fixture.database = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error }),
        },
      };
      await expect(readSession()).rejects.toMatchObject({
        code: "SERVER_ERROR",
        status: 503,
      });
    },
  );
});
