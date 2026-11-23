# @monorise-team/auth

Logowanie produktów Monorise przez MonoriseCore (`auth.monorise.studio`): sprawdzanie tokenów, OAuth 2.1 z PKCE, sesje BFF w Next.js i wtyczka Fastify. Decyzje: ADR-0022 (OAuth i osobne sesje aplikacji), ADR-0023 (kontrakt tokenu), ADR-0050 (BFF), ADR-0037 (firma zawsze z tokenu).

Przykład: Anna otwiera AvenMail w przeglądarce, loguje się w Core i wraca do poczty. Przeglądarka ma tylko ciasteczko z losowym identyfikatorem, a tokeny z Core leżą zaszyfrowane w bazie AvenMail. Ta sama Anna w aplikacji na telefon loguje się przez przeglądarkę systemową i wysyła do API AvenMail token z Core.

| Import                        | Do czego                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `@monorise-team/auth`         | sprawdzanie tokenów (`createTokenVerifier`), kontekst firmy, funkcje OAuth niezależne od platformy |
| `@monorise-team/auth/next`    | sesje BFF: logowanie, powrót z Core, wylogowanie, `authenticate` w trasach API                     |
| `@monorise-team/auth/fastify` | wtyczka Fastify (`request.authenticate()`), np. dla Core API                                       |

## Aplikacja Next.js (BFF)

Klient musi być zarejestrowany w Core (lokalnie `pnpm oauth:seed` w MonoriseCore) z adresem powrotu `<appUrl>/api/auth/callback`. Logowanie od razu obejmuje wszystkie API z `resources`; o token dla API spoza tej listy Core później odmówi.

```ts
// src/server/auth.ts
import { createWebAuth } from "@monorise-team/auth/next";

export const auth = createWebAuth({
  issuer: process.env.CORE_AUTH_URL!, // http://localhost:3100
  clientId: "avenmail-web",
  clientSecret: process.env.AVEN_OAUTH_CLIENT_SECRET,
  appUrl: process.env.AVEN_APP_URL!, // http://aven-mail.localhost:3000
  resources: [process.env.AVEN_API_URL!, process.env.CORE_API_URL!], // pierwsze: API produktu
  secret: process.env.AVEN_SESSION_SECRET!, // co najmniej 32 znaki
  store: sessionStore, // SessionStore na tabeli sesji produktu
});
```

```ts
// src/app/api/auth/sign-in/route.ts   (GET ?returnTo=/skrzynka)
export const GET = (request: Request) => auth.signIn(request);
// src/app/api/auth/callback/route.ts
export const GET = (request: Request) => auth.callback(request);
// src/app/api/auth/sign-out/route.ts  (tylko POST z adresu aplikacji)
export const POST = (request: Request) => auth.signOut(request);
```

```ts
// trasa API: przeglądarka (ciasteczko) albo aplikacja na telefon i komputer (Authorization: Bearer)
const { context, session } = await auth.authenticate(request);
context.organizationId; // firma zawsze z tokenu albo sesji
await session?.accessToken(process.env.CORE_API_URL); // token dla Core API

// Server Component
const session = await auth.getSessionFromCookie((await cookies()).get(auth.cookieName)?.value);
```

- **Sesje w bazie:** `SessionStore` zapisuje skrót identyfikatora z ciasteczka, konto, firmę, koniec ważności i zaszyfrowane dane (AES-256-GCM, klucz z `secret`). Po dezaktywacji konta usuń jego sesje po `accountId`. `memorySessionStore()` służy tylko testom.
- **Odświeżanie:** token API produktu żyje 5 minut, więc co 5 minut Core potwierdza, że konto może pracować. Równoczesne żądania jednej sesji odświeżają tokeny po kolei, bo Core unieważnia całą rodzinę tokenów, gdy stary token odświeżania wróci.
- **Błędy:** `AuthError` (`UNAUTHENTICATED` 401, `PERMISSION_DENIED` 403) to odmowa. `AuthUnavailableError` (503) oznacza chwilowo niedostępny Core: nie wylogowuj wtedy użytkownika.
- **Bezpieczeństwo:** PKCE, `state`, `nonce` i parametr `iss` (RFC 9207) przy każdym logowaniu; `returnTo` tylko jako ścieżka w aplikacji; zmiany przez ciasteczko (POST, PATCH, DELETE) tylko z adresu aplikacji (CSRF); nowe logowanie usuwa poprzednią sesję przeglądarki.
- **Wymiana sekretu:** `secret: [nowy, stary]`, a po 30 dniach sam nowy.

## Serwer Fastify

```ts
import { monoriseAuth } from "@monorise-team/auth/fastify";

await app.register(monoriseAuth, { issuer: "https://auth.monorise.studio", audience: "https://api.monorise.studio" });
app.get("/v1/me", async (request) => {
  const context = await request.authenticate(); // AuthError 401 bez ważnego tokenu
});
```

## Aplikacje na komputer i telefon

Logują się przez przeglądarkę systemową (RFC 8252) jako klienci publiczni, bez sekretu. Do tego służą `createPkce`, `authorizeUrl`, `exchangeCode`, `refreshTokens` i `revokeToken`; tokeny trzymają w systemowym sejfie (Keychain, Keystore). Gotowy przepływ dla Expo i Tauri dodamy przy podłączaniu AvenMail.

## Ograniczenia

- Tokeny OAuth z Core nie mają na razie pola `amr` (metody logowania): biblioteka logowania w Core traktuje je jako zastrzeżone. `context.methods` jest pustą listą, dopóki nie ustalimy sposobu przekazania MFA.
