import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizeUrl, createPkce, exchangeCode, OAuthError, oauthEndpoints, refreshTokens } from "../src/index.js";
import { CLIENT_ID, CLIENT_SECRET, CORE_API, createFakeCore, ISSUER, RESOURCE } from "./fake-core.js";

describe("OAuth 2.1 z PKCE", () => {
  it("tworzy weryfikator PKCE i jego skrót S256", async () => {
    const pkce = await createPkce();
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pkce.challenge).toBe(createHash("sha256").update(pkce.verifier).digest("base64url"));
    expect((await createPkce()).verifier).not.toBe(pkce.verifier);
  });

  it("buduje adres logowania z PKCE, nonce i wszystkimi API", () => {
    const url = authorizeUrl({
      issuer: `${ISSUER}/`,
      clientId: CLIENT_ID,
      redirectUri: "https://aven-mail.example.test/api/auth/callback",
      state: "stan",
      codeChallenge: "skrot",
      nonce: "nonce",
      resources: [RESOURCE, CORE_API],
      prompt: "login",
    });
    expect(`${url.origin}${url.pathname}`).toBe(oauthEndpoints(ISSUER).authorize);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid profile email offline_access");
    expect(url.searchParams.getAll("resource")).toEqual([RESOURCE, CORE_API]);
    expect(url.searchParams.get("prompt")).toBe("login");
  });

  it("wymienia kod tylko z właściwym weryfikatorem, a token odświeżania działa raz", async () => {
    const core = await createFakeCore();
    const client = { issuer: ISSUER, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: core.fetch };
    const pkce = await createPkce();
    const redirectUri = "https://aven-mail.example.test/api/auth/callback";
    const start = authorizeUrl({
      ...client,
      redirectUri,
      state: "s",
      codeChallenge: pkce.challenge,
      resources: [RESOURCE],
    });

    const wrong = new URL(core.approve(start.toString())).searchParams.get("code") ?? "";
    await expect(
      exchangeCode({ ...client, code: wrong, redirectUri, codeVerifier: "zly-weryfikator" }),
    ).rejects.toMatchObject({
      error: "invalid_grant",
      status: 400,
    });

    const code = new URL(core.approve(start.toString())).searchParams.get("code") ?? "";
    const tokens = await exchangeCode({
      ...client,
      code,
      redirectUri,
      codeVerifier: pkce.verifier,
      resource: RESOURCE,
    });
    expect(tokens.expires_in).toBe(300);
    const refreshToken = tokens.refresh_token ?? "";

    // Token dla API spoza logowania: Core odpowiada invalid_target i nie zużywa tokenu odświeżania.
    await expect(refreshTokens({ ...client, refreshToken, resource: CORE_API })).rejects.toMatchObject({
      error: "invalid_target",
    });
    const refreshed = await refreshTokens({ ...client, refreshToken, resource: RESOURCE });
    expect(refreshed.refresh_token).not.toBe(refreshToken);
    const reuse = await refreshTokens({ ...client, refreshToken }).catch((error: unknown) => error);
    expect(reuse).toBeInstanceOf(OAuthError);
    expect(reuse).toMatchObject({ error: "invalid_grant" });
  });
});
