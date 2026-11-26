import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  CoreApiError,
  CoreApiMissingTokenError,
  CoreApiProtocolError,
  CoreApiUnavailableError,
  createCoreClient,
  paginate,
  type CoreClient,
  type CoreOperationId,
  type DirectoryEmployee,
  type FetchFunction,
  type Health,
  type Invitation,
  type Me,
  type OpenApiDocument,
  type Organization,
  type PaginatedResult,
  type PermissionSnapshot,
  type Unit,
  type UnitMember,
  type operations,
} from "../src/index.js";

const SECRET_TOKEN = "eyJhbGciOiJFZERTQSJ9.anna-secret-token.sig";
const MACHINE_TOKEN = "eyJhbGciOiJFZERTQSJ9.timotime-machine-token.sig";

const ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";
const ANNA_ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f";
const ANNA_EMPLOYEE_ID = "01936f4e-9b2c-7d4e-8f5a-6b7c8d9e0f1a";
const JAN_ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-111111111111";
const KRAKOW_UNIT_ID = "01936f4e-1000-7000-8000-000000000001";
const TEAM_A_UNIT_ID = "01936f4e-1000-7000-8000-000000000002";

const ANNA_ME: Me = {
  account: {
    id: ANNA_ACCOUNT_ID,
    email: "anna@acme.test",
    status: "ACTIVE",
    isOwner: false,
  },
  employee: {
    id: ANNA_EMPLOYEE_ID,
    accountId: ANNA_ACCOUNT_ID,
    accountStatus: "ACTIVE",
    firstName: "Anna",
    lastName: "Kowalska",
    workEmail: "anna@acme.test",
    jobTitle: "Product Manager",
    status: "ACTIVE",
  },
  organization: {
    id: ORG_ID,
    name: "Acme",
    status: "ACTIVE",
  },
};

const ACME_ORGANIZATION: Organization = {
  id: ORG_ID,
  name: "Acme",
  status: "ACTIVE",
  createdAt: "2026-11-20T09:00:00Z",
  domains: [
    {
      id: "01a20000-0000-7000-8000-0000000000d1",
      domain: "acme.test",
      status: "VERIFIED",
      isPrimary: true,
      verifiedAt: "2026-11-20T09:15:00Z",
      lastCheckedAt: "2026-11-20T09:15:00Z",
      verificationTxtName: null,
      verificationTxtValue: null,
    },
  ],
};

const KRAKOW_UNIT: Unit = {
  id: KRAKOW_UNIT_ID,
  name: "Oddział Kraków",
  type: "BRANCH",
  parentId: null,
  status: "ACTIVE",
  createdAt: "2026-11-20T10:00:00Z",
  updatedAt: "2026-11-20T10:00:00Z",
};

const TEAM_A_UNIT: Unit = {
  id: TEAM_A_UNIT_ID,
  name: "Zespół Kraków A",
  type: "TEAM",
  parentId: KRAKOW_UNIT_ID,
  status: "ACTIVE",
  createdAt: "2026-11-20T10:05:00Z",
  updatedAt: "2026-11-20T10:05:00Z",
};

const JAN_SNAPSHOT: PermissionSnapshot = {
  accountId: JAN_ACCOUNT_ID,
  organizationId: ORG_ID,
  authzRevision: 4,
  isOwner: false,
  products: ["timotime"],
  grants: [
    {
      permission: "timotime.entries.approve",
      scope: { type: "UNIT", unitId: KRAKOW_UNIT_ID },
      validFrom: null,
      validUntil: null,
    },
  ],
  units: [
    { id: KRAKOW_UNIT_ID, parentId: null },
    { id: TEAM_A_UNIT_ID, parentId: KRAKOW_UNIT_ID },
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

  it("substitutes and URL-encodes multiple path parameters and sends JSON bodies on PUT/POST 201", async () => {
    const fetchMock = vi.fn<FetchFunction>(async (_url, init) => {
      if (init?.method === "POST") {
        return jsonResponse(
          {
            data: KRAKOW_UNIT,
            meta: { requestId: "req_create_unit" },
            error: null,
          },
          201,
        );
      }
      return jsonResponse({
        data: {
          unitId: KRAKOW_UNIT_ID,
          employeeId: ANNA_EMPLOYEE_ID,
          role: "LEADER",
          joinedAt: "2026-11-24T12:00:00Z",
          employee: ANNA_ME.employee,
        },
        meta: { requestId: "req_put_member" },
        error: null,
      });
    });

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const created = await core.createUnit({
      body: { name: "Oddział Kraków", type: "BRANCH", parentId: null },
    });
    expect(created).toEqual(KRAKOW_UNIT);
    const [postUrl, postInit] = fetchMock.mock.calls[0]!;
    expect(postUrl).toBe("http://localhost:3200/core/v1/units");
    expect(postInit?.method).toBe("POST");
    expect(new Headers(postInit?.headers).get("content-type")).toBe("application/json");
    expect(postInit?.body).toBe(JSON.stringify({ name: "Oddział Kraków", type: "BRANCH", parentId: null }));

    const member = await core.putUnitMember({
      path: { unitId: "unit/krakow 1", employeeId: ANNA_EMPLOYEE_ID },
      body: { role: "LEADER" },
    });
    expect(member.role).toBe("LEADER");
    const [putUrl, putInit] = fetchMock.mock.calls[1]!;
    expect(putUrl).toBe(`http://localhost:3200/core/v1/units/unit%2Fkrakow%201/members/${ANNA_EMPLOYEE_ID}`);
    expect(putInit?.method).toBe("PUT");
    expect(new Headers(putInit?.headers).get("content-type")).toBe("application/json");
    expect(putInit?.body).toBe(JSON.stringify({ role: "LEADER" }));
  });

  it("serializes boolean, numeric, and repeatable array query parameters while omitting undefined", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: [],
        meta: { requestId: "req_query_1", nextCursor: null },
        error: null,
      }),
    );

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    await core.listRoles({
      query: {
        product: "timotime",
        includeTemplates: false,
        includeArchived: true,
        limit: 25,
        cursor: undefined,
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3200/core/v1/roles?product=timotime&includeTemplates=false&includeArchived=true&limit=25",
    );

    await core.listProductDirectoryUnitMembers({
      path: { productKey: "timotime" },
      query: {
        organizationId: ORG_ID,
        unitId: [KRAKOW_UNIT_ID, TEAM_A_UNIT_ID],
        limit: 50,
      },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `http://localhost:3200/core/v1/products/timotime/directory/unit-members?organizationId=${ORG_ID}&unitId=${KRAKOW_UNIT_ID}&unitId=${TEAM_A_UNIT_ID}&limit=50`,
    );
  });

  it("reads the product event feed with a machine token and the numeric cursor", async () => {
    const event = {
      sequence: "42",
      id: "01936f4e-5000-7000-8000-000000000001",
      type: "organization.permissions.changed",
      version: 1,
      source: "core" as const,
      organizationId: ORG_ID,
      resourceType: "account",
      resourceId: JAN_ACCOUNT_ID,
      resourceVersion: 7,
      occurredAt: "2026-11-25T10:00:00.000Z",
      data: { authzRevision: 7 },
    };
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({ data: [event], meta: { requestId: "req_1", nextCursor: null }, error: null }),
    );
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => MACHINE_TOKEN,
      fetch: fetchMock,
    });

    // Serwer TimoTime pyta o zdarzenia po numerze 41 (ostatnio przetworzone)
    const page = await core.listProductEvents({
      path: { productKey: "timotime" },
      query: { cursor: "41", limit: 100 },
    });
    expect(page).toEqual({ items: [event], nextCursor: null });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3200/core/v1/products/timotime/events?cursor=41&limit=100",
    );
    expectTypeOf(page.items[0]!.sequence).toEqualTypeOf<string>();
  });

  it("lists, creates, resends and revokes employee invitations", async () => {
    const invitation: Invitation = {
      id: "01936f4e-4000-7000-8000-000000000001",
      accountId: JAN_ACCOUNT_ID,
      employeeId: "01936f4e-9b2c-7d4e-8f5a-222222222222",
      email: "jan@acme.test",
      status: "PENDING",
      expiresAt: "2026-12-02T10:00:00.000Z",
      invitedByAccountId: ANNA_ACCOUNT_ID,
      acceptedAt: null,
      createdAt: "2026-11-25T10:00:00.000Z",
      updatedAt: "2026-11-25T10:00:00.000Z",
      delivery: {
        status: "SENT",
        attempts: 1,
        lastAttemptAt: "2026-11-26T10:00:00.000Z",
        sentAt: "2026-11-26T10:00:01.000Z",
      },
    };
    const responses = [
      jsonResponse({ data: [invitation], meta: { requestId: "req_1", nextCursor: "next-page" }, error: null }),
      jsonResponse({ data: invitation, meta: { requestId: "req_2" }, error: null }, 201),
      jsonResponse({ data: invitation, meta: { requestId: "req_3" }, error: null }),
      new Response(null, { status: 204 }),
    ];
    const fetchMock = vi.fn<FetchFunction>(async () => responses.shift()!);
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    // Anna (Owner) widzi oczekujące zaproszenia, zaprasza Jana, wysyła ponownie i cofa
    const page = await core.listInvitations({ query: { status: "PENDING", limit: 20 } });
    expect(page).toEqual({ items: [invitation], nextCursor: "next-page" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3200/core/v1/invitations?status=PENDING&limit=20");

    const created = await core.createInvitation({
      body: { email: "jan@acme.test", firstName: "Jan", lastName: "Nowak" },
    });
    expect(created).toEqual(invitation);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      email: "jan@acme.test",
      firstName: "Jan",
      lastName: "Nowak",
    });

    const resent = await core.resendInvitation({ path: { invitationId: invitation.id } });
    expect(resent).toEqual(invitation);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`http://localhost:3200/core/v1/invitations/${invitation.id}/resend`);

    const revoked = await core.revokeInvitation({ path: { invitationId: invitation.id } });
    expect(revoked).toBeUndefined();
    expect(fetchMock.mock.calls[3]?.[0]).toBe(`http://localhost:3200/core/v1/invitations/${invitation.id}`);
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("DELETE");
  });

  it("handles 204 No Content for revokeAppAccess and deleteRoleAssignment", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () => new Response(null, { status: 204 }));
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const revoked = await core.revokeAppAccess({ path: { appAccessId: "01936f4e-2000-7000-8000-000000000001" } });
    expect(revoked).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3200/core/v1/app-access/01936f4e-2000-7000-8000-000000000001",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");

    const deleted = await core.deleteRoleAssignment({
      path: { assignmentId: "01936f4e-3000-7000-8000-000000000001" },
    });
    expect(deleted).toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:3200/core/v1/role-assignments/01936f4e-3000-7000-8000-000000000001",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("returns { items, nextCursor } for paginated operations and rejects malformed list envelopes", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: [KRAKOW_UNIT],
        meta: { requestId: "req_units_1", nextCursor: "cur_page_2" },
        error: null,
      }),
    );

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const page = await core.listUnits({ query: { limit: 1, status: "ACTIVE" } });
    expect(page).toEqual({
      items: [KRAKOW_UNIT],
      nextCursor: "cur_page_2",
    });

    const badMetaCore = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: async () =>
        jsonResponse({
          data: [KRAKOW_UNIT],
          meta: { requestId: "req_missing_cursor" },
          error: null,
        }),
    });
    await expect(badMetaCore.listUnits()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 200,
    });

    const badDataCore = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: async () =>
        jsonResponse({
          data: { notAnArray: true },
          meta: { requestId: "req_bad_data", nextCursor: null },
          error: null,
        }),
    });
    await expect(badDataCore.listUnits()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 200,
    });
  });

  it("iterates across multiple pages with paginate(), passing limit, filters, headers, and signal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<FetchFunction>(async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get("cursor") === "cur_2") {
        return jsonResponse({
          data: [TEAM_A_UNIT],
          meta: { requestId: "req_units_p2", nextCursor: null },
          error: null,
        });
      }
      return jsonResponse({
        data: [KRAKOW_UNIT],
        meta: { requestId: "req_units_p1", nextCursor: "cur_2" },
        error: null,
      });
    });

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const units: Unit[] = [];
    for await (const unit of paginate(core.listUnits, {
      query: { limit: 1, status: "ACTIVE" },
      headers: { "X-Trace-Test": "acme" },
      signal: controller.signal,
    })) {
      units.push(unit);
    }

    expect(units).toEqual([KRAKOW_UNIT, TEAM_A_UNIT]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3200/core/v1/units?limit=1&status=ACTIVE");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:3200/core/v1/units?limit=1&status=ACTIVE&cursor=cur_2");
    expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(controller.signal);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("x-trace-test")).toBe("acme");
  });

  it("stops fetching further pages when the caller breaks out of paginate() early", async () => {
    const fetchMock = vi.fn<FetchFunction>(async () =>
      jsonResponse({
        data: [KRAKOW_UNIT],
        meta: { requestId: "req_units_p1", nextCursor: "cur_2" },
        error: null,
      }),
    );

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchMock,
    });

    const collected: Unit[] = [];
    for await (const unit of paginate(core.listUnits)) {
      collected.push(unit);
      break;
    }

    expect(collected).toEqual([KRAKOW_UNIT]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("authenticates product machine-token operations via getAccessToken", async () => {
    const getAccessToken = vi.fn(async () => MACHINE_TOKEN);
    const fetchMock = vi.fn<FetchFunction>(async (url, init) => {
      if (init?.method === "PUT") {
        return jsonResponse({
          data: { added: ["timotime.entries.approve"], updated: [], deprecated: [], restored: [], unchanged: 0 },
          meta: { requestId: "req_reg_1" },
          error: null,
        });
      }
      expect(url).toBe(
        `http://localhost:3200/core/v1/products/timotime/permission-snapshot?organizationId=${ORG_ID}&accountId=${JAN_ACCOUNT_ID}`,
      );
      return jsonResponse({
        data: JAN_SNAPSHOT,
        meta: { requestId: "req_snap_jan" },
        error: null,
      });
    });

    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken,
      fetch: fetchMock,
    });

    const snapshot = await core.getProductPermissionSnapshot({
      path: { productKey: "timotime" },
      query: { organizationId: ORG_ID, accountId: JAN_ACCOUNT_ID },
    });

    expect(snapshot).toEqual(JAN_SNAPSHOT);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(`Bearer ${MACHINE_TOKEN}`);

    const regResult = await core.registerProductPermissions({
      path: { productKey: "timotime" },
      body: [{ key: "timotime.entries.approve", description: "Zatwierdzanie godzin pracy" }],
    });
    expect(regResult.added).toEqual(["timotime.entries.approve"]);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization")).toBe(`Bearer ${MACHINE_TOKEN}`);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify([{ key: "timotime.entries.approve", description: "Zatwierdzanie godzin pracy" }]),
    );

    const noTokenCore = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: fetchMock,
    });
    await expect(
      noTokenCore.getProductPermissionSnapshot({
        path: { productKey: "timotime" },
        query: { organizationId: ORG_ID, accountId: JAN_ACCOUNT_ID },
      }),
    ).rejects.toMatchObject({
      name: "CoreApiMissingTokenError",
      operationId: "getProductPermissionSnapshot",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      details: [
        { field: "name", message: "Name is required" },
        { field: "type", message: "Invalid unit type" },
      ],
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

      const caught = await core.createUnit({ body: { name: "", type: "BRANCH" } }).catch((err: unknown) => err);
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

  it("throws CoreApiProtocolError when getOpenApi or getMe unexpectedly returns 204 or an empty body", async () => {
    const fetch204 = vi.fn<FetchFunction>(async () => new Response(null, { status: 204 }));
    const core204 = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetch204,
    });

    await expect(core204.getOpenApi()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 204,
    });
    await expect(core204.getMe()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 204,
    });

    const fetchEmpty200 = vi.fn<FetchFunction>(async () => new Response("", { status: 200 }));
    const coreEmpty = createCoreClient({
      baseUrl: "http://localhost:3200",
      getAccessToken: () => SECRET_TOKEN,
      fetch: fetchEmpty200,
    });

    await expect(coreEmpty.getOpenApi()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 200,
    });
    await expect(coreEmpty.getMe()).rejects.toMatchObject({
      name: "CoreApiProtocolError",
      status: 200,
    });
  });

  it("validates baseUrl on client creation without leaking credentials or raw input", () => {
    expect(() => createCoreClient({ baseUrl: "not-a-url" })).toThrow(/^Invalid Core API baseUrl$/);
    expect(() => createCoreClient({ baseUrl: "ftp://api.monorise.studio" })).toThrow(/http or https/);
    expect(() => createCoreClient({ baseUrl: "https://api.monorise.studio?x=1" })).toThrow(/query parameters/);

    for (const badUrl of [
      "https://user:s3cret@api.monorise.studio",
      "https://s3cret@api.monorise.studio",
      "not a url with s3cret",
    ]) {
      let caught: unknown;
      try {
        createCoreClient({ baseUrl: badUrl });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).not.toContain("s3cret");
      expect((caught as Error).message).not.toContain("user");
    }
  });

  it("exposes accurate generated TypeScript return types for Core operations and paginate()", () => {
    const core = createCoreClient({
      baseUrl: "http://localhost:3200",
      fetch: async () => jsonResponse({}),
    });

    expectTypeOf<keyof CoreClient>().toEqualTypeOf<CoreOperationId>();
    expectTypeOf<CoreOperationId>().toEqualTypeOf<keyof operations>();
    expectTypeOf(core.getHealth).returns.resolves.toEqualTypeOf<Health>();
    expectTypeOf(core.getMe).returns.resolves.toEqualTypeOf<Me>();
    expectTypeOf(core.getOrganization).returns.resolves.toEqualTypeOf<Organization>();
    expectTypeOf(core.getOpenApi).returns.resolves.toEqualTypeOf<OpenApiDocument>();
    expectTypeOf(core.listUnits).returns.resolves.toEqualTypeOf<PaginatedResult<Unit>>();
    expectTypeOf(core.listUnits).returns.resolves.toEqualTypeOf<{ items: Unit[]; nextCursor: string | null }>();
    expectTypeOf(core.createUnit).returns.resolves.toEqualTypeOf<Unit>();
    expectTypeOf(core.revokeAppAccess).returns.resolves.toEqualTypeOf<void>();
    expectTypeOf(core.deleteRoleAssignment).returns.resolves.toEqualTypeOf<void>();
    expectTypeOf(core.getProductPermissionSnapshot).returns.resolves.toEqualTypeOf<PermissionSnapshot>();

    expectTypeOf(paginate(core.listUnits)).toEqualTypeOf<AsyncIterableIterator<Unit>>();
    expectTypeOf(paginate(core.listUnitMembers, { path: { unitId: KRAKOW_UNIT_ID } })).toEqualTypeOf<
      AsyncIterableIterator<UnitMember>
    >();
    expectTypeOf(
      paginate(core.listProductDirectoryEmployees, {
        path: { productKey: "timotime" },
        query: { organizationId: ORG_ID },
      }),
    ).toEqualTypeOf<AsyncIterableIterator<DirectoryEmployee>>();
  });
});
