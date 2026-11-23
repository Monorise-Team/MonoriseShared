import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monoriseAuth } from "../src/fastify.js";
import { CORE_API, createFakeCore, ISSUER, ORGANIZATION_ID, RESOURCE, type FakeCore } from "./fake-core.js";

let core: FakeCore;
const app = Fastify();

beforeAll(async () => {
  core = await createFakeCore();
  await app.register(monoriseAuth, { issuer: ISSUER, audience: CORE_API, keys: core.keys });
  app.get("/v1/me", async (request) => {
    const context = await request.authenticate();
    await request.authenticate();
    return { organizationId: context.organizationId };
  });
  await app.ready();
});

afterAll(() => app.close());

describe("wtyczka Fastify", () => {
  it("bez tokenu odpowiada 401 z kodem UNAUTHENTICATED", async () => {
    const response = await app.inject({ url: "/v1/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("przyjmuje token wydany dla tego API i odrzuca token innego API", async () => {
    const ok = await app.inject({
      url: "/v1/me",
      headers: { authorization: `Bearer ${await core.token({ audience: CORE_API })}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ organizationId: ORGANIZATION_ID });

    const other = await app.inject({
      url: "/v1/me",
      headers: { authorization: `Bearer ${await core.token({ audience: RESOURCE })}` },
    });
    expect(other.statusCode).toBe(401);
  });
});
