import { describe, expect, it } from "vitest";
import {
  EventValidationError,
  createInMemoryEventBus,
  organizationPermissionsChanged,
  parseQueueMessageBody,
} from "../src/index.js";

const ORG_ID = "01936f4e-7d10-7a2b-8c3d-4e5f6a7b8c9d";

const sampleEnvelope = organizationPermissionsChanged.create({
  source: "core",
  organizationId: ORG_ID,
  resourceType: "organization",
  resourceId: ORG_ID,
  resourceVersion: 4,
  data: { authzRevision: 4 },
});

describe("parseQueueMessageBody", () => {
  it("unwraps an EventBridge envelope when detail-type matches detail.type", () => {
    const sqsBody = JSON.stringify({
      version: "0",
      id: "eb-event-1",
      "detail-type": sampleEnvelope.type,
      source: "core",
      account: "123456789012",
      time: sampleEnvelope.occurredAt,
      region: "eu-central-1",
      resources: [],
      detail: sampleEnvelope,
    });

    expect(parseQueueMessageBody(sqsBody)).toEqual(sampleEnvelope);
  });

  it("accepts a bare event envelope JSON string", () => {
    const sqsBody = JSON.stringify(sampleEnvelope);
    expect(parseQueueMessageBody(sqsBody)).toEqual(sampleEnvelope);
  });

  it("throws EventValidationError when EventBridge detail-type does not match detail.type", () => {
    const sqsBody = JSON.stringify({
      "detail-type": "organization.account.deactivated",
      detail: sampleEnvelope,
    });

    expect(() => parseQueueMessageBody(sqsBody)).toThrow(EventValidationError);
  });

  it("throws EventValidationError on invalid JSON without leaking body text", () => {
    const sensitiveBody = "{ invalid json personal-data-12345";
    let caught: unknown;
    try {
      parseQueueMessageBody(sensitiveBody);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EventValidationError);
    expect((caught as EventValidationError).message).not.toContain("personal-data-12345");
  });

  it("rejects non-object JSON bodies and incomplete EventBridge wrappers", () => {
    expect(() => parseQueueMessageBody("[]")).toThrow(EventValidationError);
    expect(() => parseQueueMessageBody('"text"')).toThrow(EventValidationError);
    expect(() => parseQueueMessageBody("null")).toThrow(EventValidationError);
    expect(() => parseQueueMessageBody(JSON.stringify({ "detail-type": "organization.updated" }))).toThrow(
      EventValidationError,
    );
    expect(() => parseQueueMessageBody(JSON.stringify({ detail: sampleEnvelope }))).toThrow(EventValidationError);
  });
});

describe("createInMemoryEventBus", () => {
  it("fans out every published envelope to all subscribers as independent JSON round-trip copies", async () => {
    const bus = createInMemoryEventBus();
    const receivedByTimoTime: unknown[] = [];
    const receivedByKivoTasks: unknown[] = [];

    bus.subscribe("timotime", async (raw) => {
      // Mutating the received payload must not affect other subscribers or bus.published.
      (raw as { data: { authzRevision: number } }).data.authzRevision = 999;
      receivedByTimoTime.push(raw);
      return "processed";
    });
    bus.subscribe("kivotasks", async (raw) => {
      receivedByKivoTasks.push(raw);
      return "processed";
    });

    await bus.publish([sampleEnvelope]);
    expect(bus.published).toEqual([sampleEnvelope]);

    const deliveries = await bus.flush();
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((d) => ({ subscriber: d.subscriber, result: d.result }))).toEqual([
      { subscriber: "timotime", result: "processed" },
      { subscriber: "kivotasks", result: "processed" },
    ]);

    expect(receivedByTimoTime).toHaveLength(1);
    expect(receivedByKivoTasks).toEqual([sampleEnvelope]);
    expect(bus.published).toEqual([sampleEnvelope]);
  });

  it("isolates failing subscribers so other consumers still receive events", async () => {
    const bus = createInMemoryEventBus();
    const okReceived: unknown[] = [];

    bus.subscribe("failing", async () => {
      throw new Error("worker down");
    });
    const unsubscribeHealthy = bus.subscribe("healthy", async (raw) => {
      okReceived.push(raw);
      return "ok";
    });

    await bus.publish([sampleEnvelope]);
    const deliveries = await bus.flush();

    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]?.subscriber).toBe("failing");
    expect(deliveries[0]?.error).toBeInstanceOf(Error);
    expect(deliveries[1]?.subscriber).toBe("healthy");
    expect(deliveries[1]?.result).toBe("ok");
    expect(okReceived).toEqual([sampleEnvelope]);

    // Unsubscribed consumers do not receive subsequent events.
    unsubscribeHealthy();
    await bus.publish([sampleEnvelope]);
    const secondDeliveries = await bus.flush();
    expect(secondDeliveries.map((d) => d.subscriber)).toEqual(["failing"]);
  });

  it("rejects empty or duplicate subscriber names", () => {
    const bus = createInMemoryEventBus();
    bus.subscribe("timotime", async () => {});

    expect(() => bus.subscribe("", async () => {})).toThrow(TypeError);
    expect(() => bus.subscribe("timotime", async () => {})).toThrow(TypeError);
  });
});
