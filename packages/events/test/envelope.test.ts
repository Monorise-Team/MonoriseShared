import { afterEach, describe, expect, it, vi } from "vitest";
import { eventEnvelopeSchema, uuidv7, type EventEnvelope } from "../src/index.js";

/** Example directly from `05-integration/events.md`. */
const DOC_EXAMPLE: EventEnvelope = {
  id: "01936f51-2e3f-7a4b-8c5d-6e7f8a9b0c1d",
  type: "organization.account.deactivated",
  version: 1,
  source: "core",
  organizationId: "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d",
  resourceType: "account",
  resourceId: "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f",
  resourceVersion: 12,
  occurredAt: "2026-11-22T10:15:00Z",
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  data: {
    employeeId: "01936f4e-9b2c-7d4e-8f5a-6b7c8d9e0f1a",
    authzRevision: 8,
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("eventEnvelopeSchema", () => {
  it("accepts the documented example and survives a JSON round trip", () => {
    const parsed = eventEnvelopeSchema.parse(DOC_EXAMPLE);
    expect(parsed).toEqual(DOC_EXAMPLE);

    const roundTripped = eventEnvelopeSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(DOC_EXAMPLE);
  });

  it("accepts null organizationId, omitted traceId, resourceVersion 0, and non-UTC offsets", () => {
    const { traceId: _omitted, ...withoutTrace } = DOC_EXAMPLE;
    const parsed = eventEnvelopeSchema.parse({
      ...withoutTrace,
      organizationId: null,
      resourceVersion: 0,
      occurredAt: "2026-11-22T11:15:00.250+01:00",
      type: "organization.unit.member.added",
      source: "timotime2",
      resourceType: "unit_member",
    });

    expect(parsed.organizationId).toBeNull();
    expect(parsed.traceId).toBeUndefined();
    expect(parsed.resourceVersion).toBe(0);
    expect(parsed.occurredAt).toBe("2026-11-22T11:15:00.250+01:00");
  });

  it.each([
    ["id (not uuid)", { id: "not-a-uuid" }],
    ["type (single segment)", { type: "organization" }],
    ["type (uppercase)", { type: "Organization.Created" }],
    ["type (hyphen)", { type: "organization.account-created" }],
    ["type (leading digit)", { type: "1org.created" }],
    ["version (0)", { version: 0 }],
    ["version (negative)", { version: -1 }],
    ["version (float)", { version: 1.5 }],
    ["source (uppercase)", { source: "Core" }],
    ["source (hyphen)", { source: "timo-time" }],
    ["source (underscore)", { source: "timo_time" }],
    ["source (empty)", { source: "" }],
    ["organizationId (invalid uuid)", { organizationId: "acme" }],
    ["resourceType (uppercase)", { resourceType: "Account" }],
    ["resourceType (dot)", { resourceType: "org.account" }],
    ["resourceType (empty)", { resourceType: "" }],
    ["resourceId (empty)", { resourceId: "" }],
    ["resourceVersion (negative)", { resourceVersion: -1 }],
    ["resourceVersion (float)", { resourceVersion: 2.5 }],
    ["occurredAt (missing offset)", { occurredAt: "2026-11-22T10:15:00" }],
    ["occurredAt (invalid date)", { occurredAt: "not-a-date" }],
    ["traceId (too short)", { traceId: "4bf92f3577b34da6" }],
    ["traceId (uppercase hex)", { traceId: "4BF92F3577B34DA6A3CE929D0E0E4736" }],
    ["traceId (non-hex)", { traceId: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" }],
    ["data (array)", { data: ["not", "object"] }],
    ["data (null)", { data: null }],
    ["data (string)", { data: "plain-text" }],
  ])("rejects invalid field: %s", (_label, patch) => {
    const result = eventEnvelopeSchema.safeParse({ ...DOC_EXAMPLE, ...patch });
    expect(result.success).toBe(false);
  });
});

describe("uuidv7", () => {
  it("produces RFC 9562 UUIDv7 strings with version 7 and RFC variant bits", () => {
    const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const generated = Array.from({ length: 50 }, () => uuidv7());

    for (const id of generated) {
      expect(id).toMatch(uuidV7Pattern);
      expect(id[14]).toBe("7");
      expect(["8", "9", "a", "b"]).toContain(id[19]);
    }
    expect(new Set(generated).size).toBe(50);
  });

  it("sorts IDs created in later milliseconds after earlier ones", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-11-22T10:15:00.000Z"));
    const first = uuidv7();

    vi.setSystemTime(new Date("2026-11-22T10:15:00.001Z"));
    const second = uuidv7();

    vi.setSystemTime(new Date("2026-11-22T10:15:01.000Z"));
    const third = uuidv7();

    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
    expect([third, first, second].sort()).toEqual([first, second, third]);
  });
});
