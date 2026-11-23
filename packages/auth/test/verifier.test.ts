import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { AuthError, AuthUnavailableError, bearerToken, createTokenVerifier, type TokenVerifier } from "../src/index.js";
import {
  ACCOUNT_ID,
  CORE_API,
  createFakeCore,
  EMPLOYEE_ID,
  ISSUER,
  ORGANIZATION_ID,
  RESOURCE,
  type FakeCore,
} from "./fake-core.js";

let core: FakeCore;
let verify: TokenVerifier;

beforeAll(async () => {
  core = await createFakeCore();
  verify = createTokenVerifier({ issuer: ISSUER, audience: RESOURCE, keys: core.keys });
});

const rejects = async (token: Promise<string> | string) =>
  expect(verify(await token)).rejects.toMatchObject({ name: "AuthError", code: "UNAUTHENTICATED", statusCode: 401 });

describe("sprawdzanie tokenu dostępu z Core", () => {
  it("zwraca kontekst firmy z poprawnego tokenu", async () => {
    const context = await verify(await core.token());
    expect(context).toMatchObject({
      accountId: ACCOUNT_ID,
      organizationId: ORGANIZATION_ID,
      employeeId: EMPLOYEE_ID,
      sessionId: "sesja-core-1",
      authzRevision: 0,
      methods: [],
      clientId: "avenmail-web",
      scopes: ["openid", "profile", "email", "offline_access"],
    });
    expect(context.expiresAt).toBeInstanceOf(Date);
  });

  it("odrzuca token dla innego API, od innego wystawcy albo po terminie", async () => {
    await rejects(core.token({ audience: CORE_API }));
    await rejects(core.token({ issuer: "https://zly.example.test" }));
    await rejects(core.token({ issuedAt: Math.floor(Date.now() / 1000) - 600, expiresIn: 300 }));
  });

  it("odrzuca ID token i inne tokeny niż tokeny dostępu", async () => {
    await rejects(core.token({ typ: "JWT" }));
  });

  it("odrzuca token bez pól firmy", async () => {
    await rejects(core.token({ omit: ["org_id"] }));
    await rejects(core.token({ claims: { employee_id: "nie-uuid" } }));
  });

  it("odrzuca podpis obcym kluczem i algorytm inny niż EdDSA", async () => {
    const stranger = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    await rejects(core.token({ key: stranger.privateKey }));
    const hs256 = await new SignJWT({ org_id: ORGANIZATION_ID, employee_id: EMPLOYEE_ID, authz_rev: 0 })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt", kid: "klucz-1" })
      .setIssuer(ISSUER)
      .setSubject(ACCOUNT_ID)
      .setAudience(RESOURCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("wspolny-sekret-wspolny-sekret-wspolny"));
    await rejects(hs256);
    await rejects("to-nie-jest-token");
  });

  it("zgłasza niedostępny Core zamiast odmowy, gdy nie da się pobrać kluczy", async () => {
    const offline = createTokenVerifier({
      issuer: ISSUER,
      audience: RESOURCE,
      keys: () => Promise.reject(new TypeError("fetch failed")),
    });
    const error = await offline(await core.token()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthUnavailableError);
    expect(error).not.toBeInstanceOf(AuthError);
  });
});

describe("nagłówek Authorization", () => {
  it("wyciąga token tylko z poprawnego nagłówka Bearer", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
