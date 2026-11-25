import { uuidv7 } from "@monorise-team/events";
import { decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { createTestIssuer } from "../src/index.js";

const ISSUER_URL = "https://auth.monorise.test";
const AUDIENCE = "https://timotime.monorise.test";

describe("createTestIssuer — klucze Ed25519 i tokeny JWT", () => {
  it("generuje parę Ed25519, publikuje JWKS z kid i podpisuje poprawny token użytkownika", async () => {
    const issuer = await createTestIssuer({ issuer: `${ISSUER_URL}/`, kid: "klucz-testowy-1" });

    expect(issuer.issuer).toBe(ISSUER_URL);
    expect(issuer.jwksUrl).toBe(`${ISSUER_URL}/api/auth/jwks`);
    expect(issuer.jwks.keys).toHaveLength(1);
    expect(issuer.jwks.keys[0]).toMatchObject({
      kty: "OKP",
      crv: "Ed25519",
      kid: "klucz-testowy-1",
      alg: "EdDSA",
      use: "sig",
    });

    const accountId = uuidv7();
    const organizationId = uuidv7();
    const employeeId = uuidv7();
    const now = new Date("2026-11-25T10:00:00Z");

    const token = await issuer.signUserToken({
      accountId,
      organizationId,
      employeeId,
      audience: AUDIENCE,
      authzRevision: 4,
      sid: "sesja-123",
      now,
    });

    const header = decodeProtectedHeader(token);
    expect(header).toEqual({ alg: "EdDSA", kid: "klucz-testowy-1", typ: "at+jwt" });

    const verified = await jwtVerify(token, issuer.localJWKSet, {
      issuer: ISSUER_URL,
      audience: AUDIENCE,
      algorithms: ["EdDSA"],
      currentDate: new Date("2026-11-25T10:02:00Z"),
    });

    expect(verified.payload).toMatchObject({
      iss: ISSUER_URL,
      aud: AUDIENCE,
      sub: accountId,
      org_id: organizationId,
      employee_id: employeeId,
      authz_rev: 4,
      sid: "sesja-123",
    });
    expect((verified.payload.exp ?? 0) - (verified.payload.iat ?? 0)).toBe(300);
  });

  it("podpisuje token maszynowy z client_id i scope, bez org_id i employee_id", async () => {
    const issuer = await createTestIssuer({ issuer: ISSUER_URL });

    const token = await issuer.signMachineToken({
      clientId: "timotime-web",
      audience: "https://api.monorise.test",
      scope: ["core:permissions.read", "core:directory.read"],
    });

    const verified = await jwtVerify(token, issuer.localJWKSet, {
      issuer: ISSUER_URL,
      audience: "https://api.monorise.test",
      algorithms: ["EdDSA"],
    });

    expect(verified.payload).toMatchObject({
      client_id: "timotime-web",
      scope: "core:permissions.read core:directory.read",
    });
    expect(verified.payload.org_id).toBeUndefined();
    expect(verified.payload.employee_id).toBeUndefined();
    expect(verified.payload.authz_rev).toBeUndefined();
  });

  it("generuje wszystkie niepoprawne warianty tokenu (expired, wrongAudience, foreignKey, wrongIssuer, missingOrgId)", async () => {
    const issuer = await createTestIssuer({ issuer: ISSUER_URL });
    const base = {
      accountId: uuidv7(),
      organizationId: uuidv7(),
      employeeId: uuidv7(),
      audience: AUDIENCE,
    };

    const expired = await issuer.invalid.expired(base);
    await expect(
      jwtVerify(expired, issuer.localJWKSet, { issuer: ISSUER_URL, audience: AUDIENCE, algorithms: ["EdDSA"] }),
    ).rejects.toThrow();

    const wrongAudience = await issuer.invalid.wrongAudience(base);
    await expect(
      jwtVerify(wrongAudience, issuer.localJWKSet, { issuer: ISSUER_URL, audience: AUDIENCE, algorithms: ["EdDSA"] }),
    ).rejects.toThrow();

    const foreignKey = await issuer.invalid.foreignKey(base);
    await expect(
      jwtVerify(foreignKey, issuer.localJWKSet, { issuer: ISSUER_URL, audience: AUDIENCE, algorithms: ["EdDSA"] }),
    ).rejects.toThrow();

    const wrongIssuer = await issuer.invalid.wrongIssuer(base);
    await expect(
      jwtVerify(wrongIssuer, issuer.localJWKSet, { issuer: ISSUER_URL, audience: AUDIENCE, algorithms: ["EdDSA"] }),
    ).rejects.toThrow();

    const missingOrgId = await issuer.invalid.missingOrgId(base);
    const verifiedNoOrg = await jwtVerify(missingOrgId, issuer.localJWKSet, {
      issuer: ISSUER_URL,
      audience: AUDIENCE,
      algorithms: ["EdDSA"],
    });
    expect(verifiedNoOrg.payload.org_id).toBeUndefined();
    expect(decodeJwt(missingOrgId).sub).toBe(base.accountId);
  });
});
