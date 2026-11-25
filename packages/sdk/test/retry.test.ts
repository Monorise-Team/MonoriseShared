import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CoreApiError,
  CoreApiProtocolError,
  CoreApiUnavailableError,
  createCoreClient,
  type CoreRetryConfig,
  type CoreRetryOption,
  type FetchFunction,
  type Unit,
} from "../src/index.js";

const SECRET_TOKEN = "eyJhbGciOiJFZERTQSJ9.anna-secret-token.sig";
const KRAKOW_UNIT_ID = "01936f4e-1000-7000-8000-000000000001";
const ANNA_EMPLOYEE_ID = "01936f4e-9b2c-7d4e-8f5a-6b7c8d9e0f1a";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KRAKOW_UNIT: Unit = {
  id: KRAKOW_UNIT_ID,
  name: "Oddział Kraków",
  type: "BRANCH",
  parentId: null,
  status: "ACTIVE",
  createdAt: "2026-11-20T10:00:00Z",
  updatedAt: "2026-11-20T10:00:00Z",
};

function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function errorEnvelopeResponse(status: number, code: string, message: string, extraHeaders?: HeadersInit): Response {
  return jsonResponse(
    {
      data: null,
      meta: { requestId: `req_err_${status}` },
      error: { code, message, details: [] },
    },
    status,
    extraHeaders,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Idempotency-Key header", () => {
  it("adds a fresh UUID v4 Idempotency-Key to every POST request", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({ data: KRAKOW_UNIT, meta: { requestId: "req_post" }, error: null }, 201),
    );
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    await core.createUnit({ body: { name: "Oddział Kraków", type: "BRANCH", parentId: null } });
    await core.createUnit({ body: { name: "Oddział Gdańsk", type: "BRANCH", parentId: null } });

    const firstKey = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("idempotency-key");
    const secondKey = new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("idempotency-key");
    expect(firstKey).toMatch(UUID_V4_PATTERN);
    expect(secondKey).toMatch(UUID_V4_PATTERN);
    expect(firstKey).not.toBe(secondKey);
  });

  it("falls back to crypto.getRandomValues when crypto.randomUUID is unavailable", async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
    });

    try {
      const fetchMock = vi.fn<FetchFunction>(async () =>
        jsonResponse({ data: KRAKOW_UNIT, meta: { requestId: "req_fallback" }, error: null }, 201),
      );
      const core = createCoreClient({
        baseUrl: "http://localhost:3200",
        getAccessToken: () => SECRET_TOKEN,
        fetch: fetchMock,
      });

      await core.createUnit({ body: { name: "Oddział Kraków", type: "BRANCH", parentId: null } });
      const key = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("idempotency-key");
      expect(key).toMatch(UUID_V4_PATTERN);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves caller-supplied Idempotency-Key in any letter case (client defaults and per-call)", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({ data: KRAKOW_UNIT, meta: { requestId: "req_custom_key" }, error: null }, 201),
    );
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
      headers: { "IDEMPOTENCY-KEY": "client-default-key" },
    });

    await core.createUnit({ body: { name: "Oddział Kraków", type: "BRANCH", parentId: null } });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("idempotency-key")).toBe("client-default-key");

    await core.createUnit({
      body: { name: "Oddział Gdańsk", type: "BRANCH", parentId: null },
      headers: { "idempotency-key": "per-call-key" },
    });
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("idempotency-key")).toBe("per-call-key");
  });

  it("does not add Idempotency-Key to GET, PUT, PATCH, or DELETE requests", async () => {
    const fetchMock = vi.fn<FetchFunction>(async (_url, init) => {
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (init?.method === "PUT") {
        return jsonResponse({
          data: {
            unitId: KRAKOW_UNIT_ID,
            employeeId: ANNA_EMPLOYEE_ID,
            role: "LEADER",
            joinedAt: "2026-11-24T12:00:00Z",
            employee: {
              id: ANNA_EMPLOYEE_ID,
              accountId: "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f",
              accountStatus: "ACTIVE",
              firstName: "Anna",
              lastName: "Kowalska",
              workEmail: "anna@acme.test",
              jobTitle: null,
              status: "ACTIVE",
            },
          },
          meta: { requestId: "req_put" },
          error: null,
        });
      }
      if (init?.method === "PATCH") {
        return jsonResponse({ data: KRAKOW_UNIT, meta: { requestId: "req_patch" }, error: null });
      }
      return jsonResponse({ data: { status: "ok" }, meta: { requestId: "req_get" }, error: null });
    });

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    await core.getHealth();
    await core.putUnitMember({
      path: { unitId: KRAKOW_UNIT_ID, employeeId: ANNA_EMPLOYEE_ID },
      body: { role: "LEADER" },
    });
    await core.updateUnit({ path: { unitId: KRAKOW_UNIT_ID }, body: { name: "Oddział Południe" } });
    await core.deleteUnitMember({ path: { unitId: KRAKOW_UNIT_ID, employeeId: ANNA_EMPLOYEE_ID } });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("idempotency-key")).toBeNull();
    }
  });
});

describe("retry behaviour", () => {
  it("makes exactly one request by default (retry disabled)", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () => {
      throw new TypeError("fetch failed");
    });
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    await expect(core.getHealth()).rejects.toBeInstanceOf(CoreApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries POST on network failure with the same Idempotency-Key and treats Idempotency-Replayed: true as normal success", async () => {
    let calls = 0;
    const fetchMock = vi.fn<FetchFunction>(async () => {
      calls++;
      if (calls === 1) {
        throw new TypeError("network lost");
      }
      return jsonResponse({ data: KRAKOW_UNIT, meta: { requestId: "req_replayed" }, error: null }, 201, {
        "Idempotency-Replayed": "true",
      });
    });

    const retry: CoreRetryConfig = { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 };
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
      retry,
    });

    const unit = await core.createUnit({ body: { name: "Oddział Kraków", type: "BRANCH", parentId: null } });

    expect(unit).toEqual(KRAKOW_UNIT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstKey = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("idempotency-key");
    const secondKey = new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("idempotency-key");
    expect(firstKey).toMatch(UUID_V4_PATTERN);
    expect(secondKey).toBe(firstKey);
  });

  it("retries 503 with Retry-After: 0 and 429/502/504 on GET", async () => {
    const responses = [
      errorEnvelopeResponse(503, "SERVICE_UNAVAILABLE", "Try again", { "Retry-After": "0" }),
      errorEnvelopeResponse(429, "RATE_LIMITED", "Slow down", { "Retry-After": "0" }),
      new Response("<html>502</html>", { status: 502 }),
      new Response("<html>504</html>", { status: 504 }),
      jsonResponse({ data: { status: "ok" }, meta: { requestId: "req_ok" }, error: null }),
    ];
    const fetchMock = vi.fn<FetchFunction>(async () => responses.shift()!);
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
      retry: { attempts: 5, baseDelayMs: 1, maxDelayMs: 5 },
    });

    const health = await core.getHealth();
    expect(health).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("honours Retry-After in seconds and HTTP-date format capped by maxDelayMs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));

    const responses = [
      errorEnvelopeResponse(429, "RATE_LIMITED", "Too many requests", { "Retry-After": "10" }),
      errorEnvelopeResponse(503, "SERVICE_UNAVAILABLE", "Busy", {
        "Retry-After": "Wed, 25 Nov 2026 12:00:03 GMT",
      }),
      jsonResponse({ data: { status: "ok" }, meta: { requestId: "req_ok" }, error: null }),
    ];
    const fetchMock = vi.fn<FetchFunction>(async () => responses.shift()!);
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
      retry: { attempts: 3, baseDelayMs: 100, maxDelayMs: 2000 },
    });

    const promise = core.getHealth();

    // First retry: Retry-After: 10s capped to maxDelayMs (2000ms) -> now is 12:00:02
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second retry: HTTP-date 12:00:03 is 1000ms ahead of 12:00:02
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    const result = await promise;
    expect(result).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    { status: 409, code: "CONFLICT", message: "Idempotency key reused with a different request body." },
    { status: 400, code: "BAD_REQUEST", message: "Bad request." },
    { status: 401, code: "UNAUTHENTICATED", message: "Authentication required." },
    { status: 404, code: "NOT_FOUND", message: "Resource not found." },
  ])("never retries $status ($code)", async ({ status, code, message }) => {
    const fetchMock = vi.fn<FetchFunction>(async () => errorEnvelopeResponse(status, code, message));
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    });

    const caught = await core
      .createUnit({ body: { name: "Oddział Kraków", type: "BRANCH", parentId: null } })
      .catch((err: unknown) => err);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(caught).toBeInstanceOf(CoreApiError);
    expect((caught as CoreApiError).status).toBe(status);
    expect((caught as CoreApiError).code).toBe(code);
  });

  it("never retries PUT, PATCH, or DELETE even on network error or 503", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      errorEnvelopeResponse(503, "SERVICE_UNAVAILABLE", "Unavailable", { "Retry-After": "0" }),
    );
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    });

    await expect(
      core.putUnitMember({ path: { unitId: KRAKOW_UNIT_ID, employeeId: ANNA_EMPLOYEE_ID }, body: { role: "LEADER" } }),
    ).rejects.toBeInstanceOf(CoreApiError);
    await expect(
      core.updateUnit({ path: { unitId: KRAKOW_UNIT_ID }, body: { name: "Oddział Południe" } }),
    ).rejects.toBeInstanceOf(CoreApiError);
    await expect(
      core.deleteUnitMember({ path: { unitId: KRAKOW_UNIT_ID, employeeId: ANNA_EMPLOYEE_ID } }),
    ).rejects.toBeInstanceOf(CoreApiError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caps attempts at 5 and throws the same error types as a single failed call when exhausted", async () => {
    const apiErrorFetch = vi.fn<FetchFunction>(async () =>
      errorEnvelopeResponse(503, "SERVICE_UNAVAILABLE", "Still down", { "Retry-After": "0" }),
    );
    const apiErrorCore = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: apiErrorFetch,
      retry: { attempts: 10, baseDelayMs: 1, maxDelayMs: 5 },
    });
    const apiErr = await apiErrorCore.getHealth().catch((err: unknown) => err);
    expect(apiErrorFetch).toHaveBeenCalledTimes(5);
    expect(apiErr).toBeInstanceOf(CoreApiError);
    expect((apiErr as CoreApiError).status).toBe(503);

    const protocolFetch = vi.fn<FetchFunction>(
      async () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );
    const protocolCore = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: protocolFetch,
      retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 5 },
    });
    const protocolErr = await protocolCore.getHealth().catch((err: unknown) => err);
    expect(protocolFetch).toHaveBeenCalledTimes(2);
    expect(protocolErr).toBeInstanceOf(CoreApiProtocolError);
    expect((protocolErr as CoreApiProtocolError).status).toBe(502);

    const networkFailure = new TypeError("connection reset");
    const networkFetch = vi.fn<FetchFunction>(async () => {
      throw networkFailure;
    });
    const networkCore = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: networkFetch,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    });
    const unavailableErr = await networkCore.getHealth().catch((err: unknown) => err);
    expect(networkFetch).toHaveBeenCalledTimes(3);
    expect(unavailableErr).toBeInstanceOf(CoreApiUnavailableError);
    expect((unavailableErr as CoreApiUnavailableError).cause).toBe(networkFailure);
  });

  it("allows per-call retry option to override the client-level setting", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      errorEnvelopeResponse(503, "SERVICE_UNAVAILABLE", "Down", { "Retry-After": "0" }),
    );
    const disabled: CoreRetryOption = false;
    const coreWithRetry = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    });

    await expect(coreWithRetry.getHealth({ retry: disabled })).rejects.toBeInstanceOf(CoreApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const coreWithoutRetry = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
    });
    await expect(
      coreWithoutRetry.getHealth({ retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 5 } }),
    ).rejects.toBeInstanceOf(CoreApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects promptly with the abort reason when AbortSignal aborts during the retry wait", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const abortReason = new Error("user cancelled");
    const fetchMock = vi.fn<FetchFunction>(async () =>
      errorEnvelopeResponse(503, "SERVICE_UNAVAILABLE", "Down", { "Retry-After": "5" }),
    );
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
      retry: { attempts: 3, baseDelayMs: 1000, maxDelayMs: 5000 },
    });

    const promise = core.getHealth({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort(abortReason);
    await expect(promise).rejects.toBe(abortReason);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry when fetch fails because the caller's AbortSignal was aborted", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<FetchFunction>(async () => {
      controller.abort(new Error("aborted"));
      throw new DOMException("Aborted", "AbortError");
    });
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    });

    await expect(core.getHealth({ signal: controller.signal })).rejects.toBeInstanceOf(CoreApiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
