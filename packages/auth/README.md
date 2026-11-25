# @monorise-team/auth

Logowanie produktów Monorise przez MonoriseCore (`auth.monorise.studio`): sprawdzanie tokenów, OAuth 2.1 z PKCE, sesje BFF w Next.js i wtyczka Fastify. Decyzje: ADR-0022 (OAuth i osobne sesje aplikacji), ADR-0023 (kontrakt tokenu), ADR-0050 (BFF), ADR-0098 (sesja BFF w zaszyfrowanym ciasteczku dla aplikacji bez bazy), ADR-0037 (firma zawsze z tokenu).

Przykład: Anna (Owner firmy Acme) loguje się w AvenMail (produkt z bazą) — przeglądarka dostaje ciasteczko z losowym identyfikatorem, a tokeny z Core leżą zaszyfrowane w bazie AvenMail. Gdy Anna wchodzi do MonorisePortal (aplikacja bez własnej bazy), jej tokeny i dane sesji są zaszyfrowane w jednym ciasteczku `HttpOnly` i nie da się ich odczytać ze skryptów. Ta sama Anna w aplikacji na telefon loguje się przez przeglądarkę systemową i wysyła do API produktu token z Core.

| Import                        | Do czego                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `@monorise-team/auth`         | sprawdzanie tokenów (`createTokenVerifier`), kontekst firmy, funkcje OAuth niezależne od platformy |
| `@monorise-team/auth/next`    | sesje BFF: logowanie, powrót z Core, wylogowanie, `authenticate` w trasach API i `proxy.ts`        |
| `@monorise-team/auth/fastify` | wtyczka Fastify (`request.authenticate()`), np. dla Core API                                       |

## Wybór trybu sesji BFF

`createWebAuth` obsługuje dokładnie jeden z dwóch trybów sesji (przekazanie obu naraz albo żadnego rzuca błąd przy starcie):

| Tryb                                               | Kiedy wybrać                                                          | Gdzie leżą tokeny z Core                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `store` (albo `session: { mode: "store", store }`) | Produkty z własną bazą danych (TimoTime, AvenMail) — ADR-0050         | Zaszyfrowane w tabeli sesji w bazie produktu; ciasteczko ma tylko losowe ID |
| `session: { mode: "cookie" }`                      | Aplikacje bez własnej bazy (MonorisePortal, MonoriseAdmin) — ADR-0098 | Zaszyfrowane (AES-256-GCM) bezpośrednio w ciasteczku sesji `HttpOnly`       |

## Aplikacja Next.js z bazą danych (`store`, ADR-0050)

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

## Aplikacja Next.js bez bazy (`session: { mode: "cookie" }`, ADR-0098)

W aplikacjach bez własnej bazy (np. MonorisePortal, MonoriseAdmin) nie przekazuj `store` — wybierz `session: { mode: "cookie" }`. Trasy `sign-in`, `callback` i `sign-out` wyglądają tak samo jak w trybie `store`.

```ts
// src/server/auth.ts
import { createWebAuth } from "@monorise-team/auth/next";

export const auth = createWebAuth({
  issuer: process.env.CORE_AUTH_URL!,
  clientId: "portal-web",
  clientSecret: process.env.PORTAL_OAUTH_CLIENT_SECRET,
  appUrl: process.env.PORTAL_APP_URL!,
  resources: [process.env.CORE_API_URL!],
  secret: process.env.PORTAL_SESSION_SECRET!, // co najmniej 32 znaki
  session: { mode: "cookie" },
});
```

### Zapisywanie odświeżonego ciasteczka w trasach API

Gdy token dostępu wygasa, `authenticate(request)` oraz `session.accessToken(resource)` odświeżają go w Core (Core obraca wtedy token odświeżania) i zapisują nowe ciasteczko w `setCookies`. Każda trasa API korzystająca z trybu `cookie` musi dołączyć je do odpowiedzi przez `applySessionCookies`:

```ts
// src/app/api/me/route.ts
import { applySessionCookies } from "@monorise-team/auth/next";
import { auth } from "@/server/auth";

export async function GET(request: Request) {
  const result = await auth.authenticate(request);
  const coreToken = await result.session?.accessToken();
  // Wywołaj Core API z coreToken...
  const response = Response.json({ data: { accountId: result.context.accountId } });
  // Zawsze na końcu: jeśli accessToken() odświeżył token, result.setCookies ma już najnowsze ciasteczko.
  return applySessionCookies(response, result);
}
```

### Wzorzec dla Server Components (`proxy.ts`)

Server Components w Next.js nie mogą ustawiać nagłówka `Set-Cookie`. Dlatego w trybie `cookie` odświeżanie odbywa się w pliku `proxy.ts` przed wyrenderowaniem strony: `forwardSessionCookie` przekazuje nowe ciasteczko do Server Componentu w tym samym żądaniu, a `applySessionCookies` zapisuje je w przeglądarce.

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { applySessionCookies, forwardSessionCookie } from "@monorise-team/auth/next";
import { auth } from "@/server/auth";

export async function proxy(request: NextRequest) {
  const session = await auth.getSession(request);
  const headers = forwardSessionCookie(request, session);
  const response = NextResponse.next({ request: { headers } });
  return applySessionCookies(response, session);
}
```

W Server Component odczytujesz już świeżą sesję bez odświeżania:

```ts
// src/app/page.tsx
import { cookies } from "next/headers";
import { auth } from "@/server/auth";

const session = await auth.getSessionFromCookie((await cookies()).get(auth.cookieName)?.value);
```

## Bezpieczeństwo, odświeżanie i ograniczenia

- **Sesje w bazie (`store`):** `SessionStore` zapisuje skrót identyfikatora z ciasteczka, konto, firmę, koniec ważności i zaszyfrowane dane (AES-256-GCM, klucz z `secret`). Po dezaktywacji konta usuń jego sesje po `accountId`. `memorySessionStore()` służy tylko testom.
- **Sesje w ciasteczku (`cookie`):** dane sesji i tokeny są szyfrowane kluczem wyprowadzonym przez HKDF-SHA-256 (`AES-256-GCM`, osobny cel klucza niż w trybie `store` i w transakcji OAuth). Flagi ciasteczka są takie same: `HttpOnly`, `SameSite=Lax`, `Path=/`, a na HTTPS dodatkowo `Secure` i przedrostek `__Host-`. Podrobione, uszkodzone, przeterminowane lub zaszyfrowane obcym kluczem ciasteczko jest traktowane jak brak sesji (bez wycieku wyjątku).
- **Limit rozmiaru ciasteczka:** domyślny limit zaszyfrowanej wartości to **3800 bajtów** (z zapasem poniżej limitu 4096 bajtów w przeglądarkach; w praktyce mieści 1–2 aktywne zasoby w `resources`, limit można zmienić przez `session.maxCookieBytes`). Przekroczenie limitu przy logowaniu albo odświeżaniu rzuca czytelny błąd — ogranicz listę `resources` (Portal/Admin potrzebują zwykle tylko Core API) albo użyj trybu `store`.
- **Odświeżanie i równoczesne żądania:** token dostępu żyje 5 minut, więc co 5 minut Core potwierdza, że konto może dalej pracować (w trybie `cookie` dezaktywacja konta lub wylogowanie w Core zadziałają najpóźniej po wygaśnięciu bieżącego tokenu dostępu). Core obraca token odświeżania przy każdym użyciu i unieważnia całą rodzinę tokenów, gdy stary token wróci (RFC 9700). W ramach jednego procesu równoczesne żądania jednej sesji są kolejkowane: w trybie `store` kolejne czytają świeżą sesję z bazy, a w trybie `cookie` korzystają z krótkiej pamięci podręcznej procesu (30 s) i wszystkie odsyłają ten sam nowy szyfrogram. Między osobnymi procesami (np. równoczesne wywołania w osobnych instancjach serverless) przegrywające żądanie dostaje `invalid_grant` z Core i kończy się czystym `401 UNAUTHENTICATED` (klient powinien ponowić żądanie z nowym ciasteczkiem albo zalogować się ponownie).
- **Błędy:** `AuthError` (`UNAUTHENTICATED` 401, `PERMISSION_DENIED` 403) to odmowa. `AuthUnavailableError` (503) oznacza chwilowo niedostępny Core: nie wylogowuj wtedy użytkownika.
- **Bezpieczeństwo:** PKCE, `state`, `nonce` i parametr `iss` (RFC 9207) przy każdym logowaniu; `returnTo` tylko jako ścieżka w aplikacji; zmiany przez ciasteczko (POST, PATCH, DELETE) tylko z adresu aplikacji (CSRF); nowe logowanie usuwa poprzednią sesję przeglądarki (w trybie `cookie` unieważnia jej token odświeżania w Core).
- **Wymiana sekretu:** `secret: [nowy, stary]`, a po 30 dniach sam nowy. Nowy klucz szyfruje nowe i odświeżane sesje, a stary nadal otwiera istniejące ciasteczka i wiersze bazy.

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
- Tryb `cookie` wymaga przesyłania odświeżonego ciasteczka przez `applySessionCookies` w trasach API i przez `proxy.ts` dla Server Components; brak tego kroku po rotacji tokenu odświeżania przerwie sesję przy kolejnym odświeżeniu.
