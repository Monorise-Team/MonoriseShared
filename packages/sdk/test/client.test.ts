import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  CoreApiError,
  CoreApiMissingTokenError,
  CoreApiProtocolError,
  CoreApiUnavailableError,
  createCoreClient,
  type CoreClient,
  type CoreOperationId,
  type FetchFunction,
  type Health,
  type Me,
  type OpenApiDocument,
  type Organization,
} from "../src/index.js";

const SECRET_TOKEN = "eyJhbGciOiJFZERTQSJ9.anna-secret-token.sig";

const ANNA_ME: Me = {
  account: {
    id: "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f",
    email: "anna@acme.test",
    status: "ACTIVE",
  },
  employee: {
    id: "01936f4e-9b2c-7d4e-8f5a-6b7c8d9e0f1a",
    firstName: "Anna",
    lastName: "Kowalska",
    workEmail: "anna@acme.test",
    jobTitle: "Product Manager",
    status: "ACTIVE",
  },
  organization: {
    id: "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d",
    name: "Acme",
    status: "ACTIVE",
  },
};

const ACME_ORGANIZATION: Organization = {
  id: "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d",
  name: "Acme",
  status: "ACTIVE",
  createdAt: "2026-11-20T09:00:00Z",
  domains: [
    {
      domain: "acme.test",
      status: "VERIFIED",
      isPrimary: true,
      verifiedAt: "2026-11-20T09:15:00Z",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createCoreClient", () => {
  it("unwraps the envelope for getHealth and never sends a token or calls getAccessToken", async () => {
    const getAccessToken = vi.fn(() => SECRET_TOKEN);
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: { status: "ok" },
        meta: { requestId: "req_health_1" },
        error: null,
      }),
    );

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken,
      fetch: fetchMock,
      headers: {
        Authorization: `Bearer ${SECRET_TOKEN}`,
        "X-Product": "avenmail",
      },
    });

    const health = await core.getHealth();

    expect(health).toEqual({ status: "ok" });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:3200/core/v1/health");
    expect(init?.method).toBe("GET");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-product")).toBe("avenmail");
  });

  it("returns the raw OpenAPI document for getOpenApi without unwrapping an envelope or sending a token", async () => {
    const rawDoc: OpenApiDocument = {
      openapi: "3.1.0",
      info: { title: "Monorise Core API", version: "0.0.0" },
      paths: { "/core/v1/health": {} },
    };
    const getAccessToken = vi.fn(() => SECRET_TOKEN);
    const fetchMock = vi.fn<FetchFunction>(async () => jsonResponse(rawDoc));

    const core = createCoreClient({
      baseUrl: "https://api.monorise.studio/",
      getAccessToken,
      fetch: fetchMock,
    });

    const doc = await core.getOpenApi();

    expect(doc).toEqual(rawDoc);
    expect(getAccessToken).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.monorise.studio/core/v1/openapi.json");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
  });

  it("sends the bearer token and unwraps Anna's data for getMe", async () => {
    const getAccessToken = vi.fn(async () => SECRET_TOKEN);
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: ANNA_ME,
        meta: { requestId: "req_me_anna" },
        error: null,
      }),
    );

    const core = createCoreClient({
      baseUrl: "https://api.monorise.studio",
      getAccessToken,
      fetch: fetchMock,
    });

    const me = await core.getMe();

    expect(me).toEqual(ANNA_ME);
    expect(me.employee.firstName).toBe("Anna");
    expect(me.organization.name).toBe("Acme");
    expect(getAccessToken).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.monorise.studio/core/v1/me");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${SECRET_TOKEN}`);
  });

  it("sends the bearer token and unwraps organization data for getOrganization", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: ACME_ORGANIZATION,
        meta: { requestId: "req_org_acme" },
        error: null,
      }),
    );

    const core = createCoreClient({
      baseUrl: "https://proxy.acme.test/monorise/",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const org = await core.getOrganization();

    expect(org).toEqual(ACME_ORGANIZATION);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://proxy.acme.test/monorise/core/v1/organization");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${SECRET_TOKEN}`);
  });

  it("forwards per-call headers and AbortSignal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: ANNA_ME,
        meta: { requestId: "req_me_signal" },
        error: null,
      }),
    );

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
      headers: { "X-Request-Id": "default-id" },
    });

    await core.getMe({
      signal: controller.signal,
      headers: { "X-Request-Id": "call-id" },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.signal).toBe(controller.signal);
    expect(new Headers(init?.headers).get("x-request-id")).toBe("call-id");
  });

  it("throws CoreApiMissingTokenError before calling fetch when a secured operation lacks a token", async () => {
    const fetchMock = vi.fn<FetchFunction>();

    const withoutProvider = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
    });
    await expect(withoutProvider.getMe()).rejects.toThrow(CoreApiMissingTokenError);

    for (const emptyToken of [null, undefined, "", "   "]) {
      const client = createCoreClient({
        baseUrl: "http://localhost:3200",
        getAccessToken: () => emptyToken,
        fetch: fetchMock,
      });
      await expect(client.getOrganization()).rejects.toMatchObject({
        name: "CoreApiMissingTokenError",
        operationId: "getOrganization",
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects access tokens containing newline characters without leaking the token", async () => {
    const fetchMock = vi.fn<FetchFunction>();
    const badToken = "secret-part\r\nX-Injected: yes";
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => badToken,
      fetch: fetchMock,
    });

    const error = await core.getMe().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("secret-part");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: 401,
      code: "UNAUTHENTICATED" as const,
      message: "Authentication required.",
      requestId: "req_unauth_1",
      details: [],
    },
    {
      status: 401,
      code: "ACCOUNT_DEACTIVATED" as const,
      message: "Account has been deactivated.",
      requestId: "req_deactivated_2",
      details: [],
    },
    {
      status: 422,
      code: "VALIDATION_FAILED" as const,
      message: "Validation failed.",
      requestId: "req_validation_3",
      details: [{ field: "email", message: "Invalid email address" }],
    },
  ])(
    "maps Core error envelope $code ($status) to CoreApiError",
    async ({ status, code, message, requestId, details }) => {
      const fetchMock = vi.fn<FetchFunction>(async () =>
        jsonResponse(
          {
            data: null,
            meta: { requestId },
            error: { code, message, details },
          },
          status,
        ),
      );

      const core = createCoreClient({
        baseUrl: "http://localhost:3200",
        getAccessToken: () => SECRET_TOKEN,
        fetch: fetchMock,
      });

      const caught = await core.getMe().catch((err: unknown) => err);
      expect(caught).toBeInstanceOf(CoreApiError);
      const apiError = caught as CoreApiError;
      expect(apiError.name).toBe("CoreApiError");
      expect(apiError.status).toBe(status);
      expect(apiError.code).toBe(code);
      expect(apiError.message).toBe(message);
      expect(apiError.requestId).toBe(requestId);
      expect(apiError.details).toEqual(details);
      expect(Object.isFrozen(apiError.details)).toBe(true);
      expect(apiError.message).not.toContain(SECRET_TOKEN);
    },
  );

  it("maps network failures to CoreApiUnavailableError with cause and without leaking the token", async () => {
    const networkFailure = new TypeError("fetch failed");
    const fetchMock = vi.fn<FetchFunction>(async () => {
      throw networkFailure;
    });

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const caught = await core.getMe().catch((err: unknown) => err);
    expect(caught).toBeInstanceOf(CoreApiUnavailableError);
    const unavailable = caught as CoreApiUnavailableError;
    expect(unavailable.name).toBe("CoreApiUnavailableError");
    expect(unavailable.cause).toBe(networkFailure);
    expect(unavailable.message).toContain("GET /core/v1/me");
    expect(unavailable.message).not.toContain(SECRET_TOKEN);
  });

  it("throws CoreApiProtocolError on non-JSON responses", async () => {
    const fetchMock = vi.fn<FetchFunction>(
      async () =>
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    );

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const caught = await core.getMe().catch((err: unknown) => err);
    expect(caught).toBeInstanceOf(CoreApiProtocolError);
    const protocolError = caught as CoreApiProtocolError;
    expect(protocolError.status).toBe(502);
    expect(protocolError.cause).toBeInstanceOf(SyntaxError);
    expect(protocolError.message).not.toContain(SECRET_TOKEN);
  });

  it("throws CoreApiProtocolError when a 200 enveloped response is missing the envelope", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () => jsonResponse(ANNA_ME, 200));

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    await expect(core.getMe()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 200,
    });
  });

  it("throws CoreApiProtocolError when an error JSON body does not match the error envelope", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () => jsonResponse({ message: "boom" }, 500));

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    await expect(core.getMe()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 500,
    });
  });

  it("throws CoreApiProtocolError when a non-enveloped response is not a JSON object", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () => jsonResponse("not-an-object", 200));

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
    });

    await expect(core.getOpenApi()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 200,
    });
  });

  it("validates baseUrl on client creation", () => {
    expect(() => createCoreClient({ baseUrl: "not-a-url" })).toThrow(/Invalid Core API baseUrl/);
    expect(() => createCoreClient({ baseUrl: "ftp://api.monorise.studio" })).toThrow(/http or https/);
    expect(() => createCoreClient({ baseUrl: "https://api.monorise.studio?x=1" })).toThrow(/query parameters/);
  });

  it("exposes accurate generated TypeScript return types for every Core operation", () => {
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: async () => jsonResponse({}),
    });

    expectTypeOf<keyof CoreClient>().toEqualTypeOf<CoreOperationId>();
    expectTypeOf<CoreOperationId>().toEqualTypeOf<"getHealth" | "getMe" | "getOpenApi" | "getOrganization">();
    expectTypeOf(core.getHealth).returns.resolves.toEqualTypeOf<Health>();
    expectTypeOf(core.getMe).returns.resolves.toEqualTypeOf<Me>();
    expectTypeOf(core.getOrganization).returns.resolves.toEqualTypeOf<Organization>();
    expectTypeOf(core.getOpenApi).returns.resolves.toEqualTypeOf<OpenApiDocument>();
  });
});
