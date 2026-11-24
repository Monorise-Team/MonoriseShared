import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createEventConsumer,
  createInMemoryEventBus,
  createOutboxRelay,
  defineEvent,
  defineEventCatalog,
  parseQueueMessageBody,
  toOutboxRecord,
  type OutboxRecord,
} from "../src/index.js";

const ACME_ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";
const ANNA_ACCOUNT_ID = "01936f4e-8a1b-7c3d-9e2f-0a1b2c3d4e5f";
const ANNA_EMPLOYEE_ID = "01936f4e-9b2c-7d4e-8f5a-6b7c8d9e0f1a";

// Test-local definition matching the Anna scenario (not exported from the package).
const accountDeactivated = defineEvent({
  type: "organization.account.deactivated",
  version: 1,
  data: z.object({
    employeeId: z.uuid(),
  }),
});

const timotimeCatalog = defineEventCatalog([accountDeactivated]);

describe("Anna deactivation end-to-end flow", () => {
  it("delivers from Core outbox through relay and bus to TimoTime, processing once despite duplicate and older out-of-order events", async () => {
    // 1. Core transactional outbox table (in memory for this test).
    const outbox: OutboxRecord[] = [];

    const deactivationV12 = accountDeactivated.create({
      source: "core",
      organizationId: ACME_ORG_ID,
      resourceType: "account",
      resourceId: ANNA_ACCOUNT_ID,
      resourceVersion: 12,
      occurredAt: new Date("2026-11-22T10:15:00.000Z"),
      data: { employeeId: ANNA_EMPLOYEE_ID },
    });

    // Simulate Core transaction writing the outbox record.
    outbox.push(toOutboxRecord(deactivationV12));

    // 2. Event bus and outbox relay.
    const bus = createInMemoryEventBus();
    const relay = createOutboxRelay({
      source: "core",
      fetchPending: async (limit) => outbox.filter((row) => row.publishedAt === null).slice(0, limit),
      publish: (envelopes) => bus.publish(envelopes),
      markPublished: async (ids, publishedAt) => {
        const idSet = new Set(ids);
        for (const row of outbox) {
          if (idSet.has(row.id)) {
            row.publishedAt = publishedAt;
          }
        }
      },
    });

    // 3. TimoTime consumer state (ProcessedEvent + local account projection with version).
    const processedEvents = new Set<string>();
    const accounts = new Map<string, { employeeId: string; active: boolean; version: number }>([
      [ANNA_ACCOUNT_ID, { employeeId: ANNA_EMPLOYEE_ID, active: true, version: 10 }],
    ]);
    const deactivationCalls: Array<{ accountId: string; employeeId: string; version: number }> = [];

    const timotimeConsumer = createEventConsumer({
      consumer: "timotime",
      catalog: timotimeCatalog,
      processed: {
        async isProcessed(_tx, consumer, eventId) {
          return processedEvents.has(`${consumer}:${eventId}`);
        },
        async markProcessed(_tx, consumer, eventId) {
          processedEvents.add(`${consumer}:${eventId}`);
        },
      },
      resourceVersions: {
        async get(_tx, resourceType, resourceId) {
          if (resourceType !== "account") return null;
          return accounts.get(resourceId)?.version ?? null;
        },
      },
      handlers: {
        "organization.account.deactivated": async (event) => {
          deactivationCalls.push({
            accountId: event.resourceId,
            employeeId: event.data.employeeId,
            version: event.resourceVersion,
          });
          accounts.set(event.resourceId, {
            employeeId: event.data.employeeId,
            active: false,
            version: event.resourceVersion,
          });
        },
      },
    });

    // Wire TimoTime to receive EventBridge-style JSON messages from the bus.
    bus.subscribe("timotime", async (raw) => {
      const sqsBody = JSON.stringify({
        "detail-type": (raw as { type: string }).type,
        detail: raw,
      });
      return timotimeConsumer.handle(parseQueueMessageBody(sqsBody));
    });

    // Relay publishes deactivation v12 from Core outbox to the bus.
    const relayResult = await relay.runOnce();
    expect(relayResult).toEqual({ fetched: 1, published: 1, failed: [] });
    expect(outbox[0]?.publishedAt).toBeInstanceOf(Date);

    // Simulate at-least-once duplicate delivery of the same v12 event AND a delayed older v11 event.
    const olderDelayedV11 = accountDeactivated.create({
      source: "core",
      organizationId: ACME_ORG_ID,
      resourceType: "account",
      resourceId: ANNA_ACCOUNT_ID,
      resourceVersion: 11,
      occurredAt: new Date("2026-11-22T10:14:00.000Z"),
      data: { employeeId: ANNA_EMPLOYEE_ID },
    });

    await bus.publish([deactivationV12, olderDelayedV11]);

    const deliveries = await bus.flush();
    expect(deliveries.map((d) => d.result)).toEqual(["processed", "duplicate", "stale"]);

    // Anna was deactivated exactly once, with version 12.
    expect(deactivationCalls).toEqual([
      {
        accountId: ANNA_ACCOUNT_ID,
        employeeId: ANNA_EMPLOYEE_ID,
        version: 12,
      },
    ]);
    expect(accounts.get(ANNA_ACCOUNT_ID)).toEqual({
      employeeId: ANNA_EMPLOYEE_ID,
      active: false,
      version: 12,
    });
  });
});
