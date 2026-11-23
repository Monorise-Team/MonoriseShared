import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { AuthContext } from "./claims.js";
import { AuthError } from "./errors.js";
import { bearerToken, createTokenVerifier, type TokenVerifier, type TokenVerifierOptions } from "./verifier.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Sprawdza token z nagłówka `Authorization: Bearer …` i zwraca kontekst firmy. Bez tokenu albo
     * z nieważnym rzuca `AuthError` (401); przy niedostępnym JWKS `AuthUnavailableError` (503).
     */
    authenticate(): Promise<AuthContext>;
  }
}

export type MonoriseAuthOptions = TokenVerifierOptions | { verifier: TokenVerifier };

const plugin: FastifyPluginAsync<MonoriseAuthOptions> = async (app, options) => {
  const verify = "verifier" in options ? options.verifier : createTokenVerifier(options);
  const results = new WeakMap<FastifyRequest, Promise<AuthContext>>();

  app.decorateRequest("authenticate", function (this: FastifyRequest): Promise<AuthContext> {
    let result = results.get(this);
    if (!result) {
      const token = bearerToken(this.headers.authorization);
      result = token ? verify(token) : Promise.reject(new AuthError("UNAUTHENTICATED", "Brak tokenu dostępu"));
      results.set(this, result);
    }
    return result;
  });
};

/** Wtyczka Fastify (np. Core API): `await app.register(monoriseAuth, { issuer, audience })`. */
export const monoriseAuth = fp(plugin, { name: "@monorise-team/auth", fastify: "5.x" });
