import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EventValidationError, UnsupportedEventVersionError, defineEvent, defineEventCatalog } from "../src/index.js";

const ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";
const RESOURCE_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f";

const sampleV1 = defineEvent({
  type: "organization.sample.updated",
  version: 1,
  data: z.object({
    count: z.number().int().nonnegative(),
  }),
});

const sampleV2 = defineEvent({
  type: "organization.sample.updated",
  version: 2,
  data: z.object({
    count: z.number().int().nonnegative(),
    reason: z.string().min(1),
  }),
});

describe("defineEvent", () => {
  it("returns a frozen definition with create, parse, and is", () => {
    expect(Object.isFrozen(sampleV1)).toBe(true);
    expect(sampleV1.type).toBe("organization.sample.updated");
    expect(sampleV1.version).toBe(1);

    const occurredAt = new Date("2026-11-22T10:15:00.000Z");
    const created = sampleV1.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 3,
      data: { count: 4 },
      occurredAt,
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(created.occurredAt).toBe("2026-11-22T10:15:00.000Z");
    expect("traceId" in created).toBe(false);
    expect(created.data).toEqual({ count: 4 });

    expect(sampleV1.parse(JSON.parse(JSON.stringify(created)))).toEqual(created);
    expect(sampleV1.is(created)).toBe(true);
    expect(sampleV2.is(created)).toBe(false);
  });

  it("throws EventValidationError on invalid create input and never leaks data values", () => {
    const secretValue = "secret-personal-email@acme.test";

    let caught: unknown;
    try {
      sampleV1.create({
        source: "core",
        organizationId: ORG_ID,
        resourceType: "sample",
        resourceId: RESOURCE_ID,
        resourceVersion: 1,
        data: { count: secretValue as unknown as number },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EventValidationError);
    const validationError = caught as EventValidationError;
    expect(validationError.issues.length).toBeGreaterThan(0);
    expect(validationError.message).not.toContain(secretValue);
    expect(JSON.stringify(validationError.issues)).not.toContain(secretValue);

    expect(() =>
      sampleV1.create({
        source: "BAD-SOURCE",
        organizationId: ORG_ID,
        resourceType: "sample",
        resourceId: RESOURCE_ID,
        resourceVersion: 1,
        data: { count: 1 },
      }),
    ).toThrow(EventValidationError);

    expect(() =>
      sampleV1.create({
        source: "core",
        organizationId: ORG_ID,
        resourceType: "sample",
        resourceId: RESOURCE_ID,
        resourceVersion: 1,
        occurredAt: new Date("invalid"),
        data: { count: 1 },
      }),
    ).toThrow(EventValidationError);
  });

  it("throws EventValidationError when parse receives wrong type, wrong version, or invalid data", () => {
    const v2Event = sampleV2.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 1,
      data: { count: 1, reason: "migration" },
    });

    expect(() => sampleV1.parse(v2Event)).toThrow(EventValidationError);
    expect(() => sampleV1.parse({ notAnEnvelope: true })).toThrow(EventValidationError);

    const secret = "sensitive-salary-99999";
    let caught: unknown;
    try {
      sampleV1.parse({ ...v2Event, version: 1, data: { count: secret } });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EventValidationError);
    expect((caught as EventValidationError).message).not.toContain(secret);
  });

  it("throws TypeError on invalid definition-time type, version, or data schema", () => {
    expect(() =>
      defineEvent({
        type: "singleword",
        version: 1,
        data: z.object({ ok: z.boolean() }),
      }),
    ).toThrow(TypeError);

    expect(() =>
      defineEvent({
        type: "organization.sample.updated",
        version: 0,
        data: z.object({ ok: z.boolean() }),
      }),
    ).toThrow(TypeError);

    expect(() =>
      defineEvent({
        type: "organization.sample.updated",
        version: 1.5,
        data: z.object({ ok: z.boolean() }),
      }),
    ).toThrow(TypeError);

    expect(() =>
      defineEvent({
        type: "organization.sample.updated",
        version: 1,
        data: z.string() as unknown as z.ZodObject<z.ZodRawShape>,
      }),
    ).toThrow(TypeError);
  });
});

describe("defineEventCatalog", () => {
  it("throws TypeError when two definitions share the same (type, version)", () => {
    const duplicate = defineEvent({
      type: "organization.sample.updated",
      version: 1,
      data: z.object({ other: z.string() }),
    });

    expect(() => defineEventCatalog([sampleV1, duplicate])).toThrow(TypeError);
  });

  it("parses known events, returns unknown for unregistered types, and throws on unsupported versions", () => {
    const catalog = defineEventCatalog([sampleV1, sampleV2]);

    const created = sampleV1.create({
      source: "core",
      organizationId: ORG_ID,
      resourceType: "sample",
      resourceId: RESOURCE_ID,
      resourceVersion: 1,
      data: { count: 7 },
    });

    const known = catalog.parse(created);
    expect(known.status).toBe("known");
    if (known.status === "known") {
      expect(known.event).toEqual(created);
      expect(known.definition).toBe(sampleV1);
    }

    const unknownEvent = {
      ...created,
      type: "billing.invoice.created",
      data: { invoiceNumber: "INV-1" },
    };
    const unknownResult = catalog.parse(unknownEvent);
    expect(unknownResult.status).toBe("unknown");
    if (unknownResult.status === "unknown") {
      expect(unknownResult.envelope.type).toBe("billing.invoice.created");
    }

    let versionError: unknown;
    try {
      catalog.parse({ ...created, version: 3 });
    } catch (error) {
      versionError = error;
    }
    expect(versionError).toBeInstanceOf(UnsupportedEventVersionError);
    expect(versionError).toMatchObject({
      name: "UnsupportedEventVersionError",
      type: "organization.sample.updated",
      version: 3,
    });

    expect(() => catalog.parse({ ...created, data: { count: -5 } })).toThrow(EventValidationError);
    expect(() => catalog.parse("invalid")).toThrow(EventValidationError);
  });
});
