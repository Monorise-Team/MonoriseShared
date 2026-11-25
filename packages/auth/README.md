# @monorise-team/auth

Logowanie produktów Monorise przez MonoriseCore (`auth.monorise.studio`): sprawdzanie tokenów, OAuth 2.1 z PKCE, sesje BFF w Next.js i wtyczka Fastify. Decyzje: ADR-0022 (OAuth i osobne sesje aplikacji), ADR-0023 (kontrakt tokenu), ADR-0050 (BFF), ADR-0098 (sesja BFF w zaszyfrowanym ciasteczku dla aplikacji bez bazy), ADR-0037 (firma zawsze z tokenu).

Przykład: Anna (Owner firmy Acme) loguje się w AvenMail (produkt z bazą) — przeglądarka dostaje ciasteczko z losowym identyfikatorem, a tokeny z Core leżą zaszyfrowane w bazie AvenMail. Gdy Anna wchodzi do MonorisePortal (aplikacja bez własnej bazy), jej tokeny i dane sesji są zaszyfrowane w jednym ciasteczku `HttpOnly` i nie da się ich odczytać ze skryptów. Ta sama Anna w aplikacji na telefon loguje się przez przeglądarkę systemową i wysyła do API produktu token z Core.

| Import                        | Do czego                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `@monorise-team/auth`         | sprawdzanie tokenów (`createTokenVerifier`), kontekst firmy, funkcje OAuth niezależne od platformy |
| `@monorise-team/auth/next`    | sesje BFF: logowanie, powrót z Core, wylogowanie, `withAuth`, `authenticate` i obsługa `proxy.ts`  |
| `@monorise-team/auth/fastify` | wtyczka Fastify (`request.authenticate()`), np. dla Core API                                       |

## Wybór trybu sesji BFF

`createWebAuth` wymaga podania dokładnie jednego z dwóch trybów sesji (przekazanie obu naraz albo żadnego rzuca błąd przy starcie):

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
  secret: process.env.AVEN_SESSION_SECRET!, // wygeneruj: openssl rand -base64 32
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
const result = await auth.authenticate(request);
result.context.organizationId; // firma zawsze z tokenu albo sesji
if (result.via === "session") {
  await result.session.accessToken(process.env.CORE_API_URL); // token dla Core API
}

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
  secret: process.env.PORTAL_SESSION_SECRET!, // wygeneruj: openssl rand -base64 32
  session: { mode: "cookie" },
});
```

### Trasy API: zalecany wzorzec `auth.withAuth`

Gdy token dostępu wygasa, `authenticate(request)` oraz `session.accessToken(resource)` odświeżają go w Core (Core obraca wtedy token odświeżania). Jeśli trasa zwróci błąd albo rzuci wyjątek bez odesłania nowego ciasteczka, przeglądarka zostanie ze starym tokenem odświeżania. Dlatego zalecanym sposobem pisania tras API jest `auth.withAuth` — zawsze dołącza najnowsze ciasteczko sesji do odpowiedzi, również na ścieżkach błędu (`AuthError`, `AuthUnavailableError` i własne `onError`):

```ts
// src/app/api/me/route.ts
import { auth } from "@/server/auth";

export const GET = (request: Request) =>
  auth.withAuth(request, async (result) => {
    const coreToken = result.via === "session" ? await result.session.accessToken() : null;
    // Wywołaj Core API z coreToken...
    return Response.json({ data: { accountId: result.context.accountId } });
  });
```

Jeśli korzystasz bezpośrednio z `auth.authenticate(request)`, zawsze przekaż wynik do `applySessionCookies(response, result)` i **zwróć odpowiedź zwróconą przez funkcję** (na odpowiedziach z niemutowalnymi nagłówkami, takich jak `Response.redirect()` czy wynik `fetch()`, funkcja tworzy nową kopię `Response` z dołączonym `Set-Cookie`, a dla istniejącego ciasteczka tej samej nazwy podmienia je bez duplikowania):

```ts
const result = await auth.authenticate(request);
const response = Response.redirect(new URL("/pulpit", request.url));
return applySessionCookies(response, result);
```

### Wzorzec dla Server Components (`proxy.ts`)

Server Components w Next.js nie mogą ustawiać nagłówka `Set-Cookie`, więc w trybie `cookie` metoda `getSessionFromCookie(value)` domyślnie ma `refresh: false` i **nie wywołuje Core** (zwraca `null`, jeśli token główny wygasł, a `accessToken()` rzuca `AuthError UNAUTHENTICATED`, gdy token dla zasobu wygasł lub nie ma go w ciasteczku). Przekazanie `{ refresh: true }` służy wyłącznie miejscom, w których sam zapisujesz `session.setCookies` do odpowiedzi (np. Route Handler lub Server Action).

Odświeżanie przed renderowaniem strony odbywa się w `proxy.ts`: `auth.getSession(request)` ma szerszy zapas wyprzedzający (`proxyRefreshMarginSeconds`, domyślnie **120 s**, wobec **30 s** w `refreshMarginSeconds` dla `authenticate()`), dzięki czemu nawigacja odświeża ciasteczko zawczasu. `forwardSessionCookie` przekazuje świeże ciasteczko do Server Componentu w tym samym żądaniu, a `applySessionCookies` odsyła je przeglądarce:

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

> **Uwaga (CSRF):** `auth.getSession(request)` **nie sprawdza CSRF** — używaj go tylko do odczytu (np. nawigacji w `proxy.ts`). W trasach zmieniających stan (`POST`, `PATCH`, `DELETE`) zawsze używaj `auth.withAuth()` albo `auth.authenticate()`.

W Server Component odczytujesz już świeżą sesję bez odpytywania Core:

```ts
// src/app/page.tsx
import { cookies } from "next/headers";
import { auth } from "@/server/auth";

const session = await auth.getSessionFromCookie((await cookies()).get(auth.cookieName)?.value);
```

## Bezpieczeństwo, odświeżanie i ograniczenia

- **Sekret sesji:** musi mieć co najmniej **32 losowe bajty** wygenerowane np. przez `openssl rand -base64 32` — nigdy nie używaj hasła ani frazy wpisanej z klawiatury. Przy wymianie podaj `secret: [nowy, stary]`, a po 30 dniach sam nowy; nowy klucz szyfruje nowe i odświeżane sesje, a stary nadal otwiera istniejące ciasteczka i wiersze bazy.
- **Sesje w bazie (`store`):** `SessionStore` zapisuje skrót identyfikatora z ciasteczka, konto, firmę, koniec ważności i zaszyfrowane dane (AES-256-GCM, klucz wyprowadzony z `secret` pod celem `"session"`). Po dezaktywacji konta usuń jego sesje po `accountId`. `memorySessionStore()` służy tylko testom.
- **Sesje w ciasteczku (`cookie`) i wiązanie z aplikacją:** dane sesji i tokeny są szyfrowane kluczem wyprowadzonym przez HKDF-SHA-256 (`AES-256-GCM`) związanym z `issuer`, `clientId`, originem `appUrl` oraz nazwą ciasteczka (`cookieName`), a dodatkowo sprawdzane jest `clientId` w odczytanym kontekście. Ciasteczko jednej aplikacji nie otworzy się w innej, nawet jeśli dzielą sekret. To samo wiązanie dotyczy ciasteczka transakcji OAuth (w obu trybach — wdrożenie tej zmiany unieważnia wyłącznie logowania będące w trakcie powrotu z Core, które użytkownik po prostu ponawia).
- **Flagi i nazwa ciasteczka:** `HttpOnly`, `SameSite=Lax`, `Path=/`, a na HTTPS dodatkowo `Secure` i wymagany przedrostek `__Host-` (na HTTP przedrostki `__Host-` i `__Secure-` są zabronione; w nazwie niedozwolone są `;`, `=`, białe znaki i znaki sterujące). Podrobione, uszkodzone, przeterminowane, zbyt długie (> 8192 znaków) lub zaszyfrowane obcym kluczem ciasteczko jest traktowane jak brak sesji (bez wycieku wyjątku).
- **Limit rozmiaru ciasteczka:** domyślny limit zaszyfrowanej wartości to **3800 bajtów** (z zapasem poniżej limitu 4096 bajtów w przeglądarkach; w praktyce mieści 1–2 aktywne zasoby w `resources`, limit można zmienić przez `session.maxCookieBytes`). Przy przekroczeniu limitu na logowaniu rzucany jest czytelny błąd (a wydany token odświeżania jest sprzątany w Core). Przy przekroczeniu limitu po rotacji podczas odświeżania biblioteka najpierw zrzuca tokeny innych zasobów (zostawiając żądany i główny, a w ostateczności sam żądany), żeby nie zgubić obróconego tokenu odświeżania; błąd rzuca dopiero, gdy nawet pojedynczy zasób się nie mieści.
- **Odświeżanie, rotacja i równoczesne żądania:** token dostępu żyje 5 minut, więc co kilka minut Core potwierdza, że konto może dalej pracować (w trybie `cookie` dezaktywacja konta lub wylogowanie w Core zadziałają najpóźniej po wygaśnięciu bieżącego tokenu dostępu). W ramach jednego procesu równoczesne żądania jednej sesji są kolejkowane i korzystają z krótkiej pamięci podręcznej (30 s), a `setCookies` zawsze odczytuje najnowsze ciasteczko sesji w procesie — spóźniona odpowiedź nie nadpisze w przeglądarce nowszego obróconego ciasteczka. Między osobnymi procesami (np. równoczesne wywołania w osobnych instancjach serverless) Core zwraca tę samą odpowiedź odświeżenia w oknie `refreshTokenReuseInterval` (20 s; jednorazowa powtórka po ~100 ms pokrywa ~5 ms lukę zapisu w Core). Poza tym oknem (lub gdy okno wynosi 0 s) ponowne użycie starego tokenu odświeżania unieważnia całą rodzinę tokenów tej aplikacji dla konta (RFC 9700) i kończy się czystym `401 UNAUTHENTICATED` — użytkownik musi się wtedy zalogować ponownie.
- **Błędy i nagłówek `Authorization`:** błędy OAuth `invalid_grant`, `invalid_request` (usunięte konto) i `invalid_scope` (obcięte zakresy) przy odświeżaniu kończą sesję (`null` / `AuthError UNAUTHENTICATED` 401). Błędy konfiguracji klienta (`invalid_client`, `unauthorized_client`, `invalid_target`) oraz niedostępność Core dają `AuthUnavailableError` (503) — surowy `OAuthError` nigdy nie ucieka z `getSession()` ani `authenticate()`. Jeśli żądanie zawiera niepusty, lecz niepoprawny nagłówek `Authorization` (np. `Basic …` albo puste `Bearer `), `authenticate()` od razu odrzuca je kodem 401 zamiast wracać do ciasteczka.
- **Bezpieczeństwo logowania i wylogowania:** PKCE, `state`, `nonce` i parametr `iss` (RFC 9207) przy każdym logowaniu; `returnTo` tylko jako ścieżka w aplikacji; zmiany przez ciasteczko (`POST`, `PATCH`, `DELETE`) tylko z adresu aplikacji (CSRF). Przy ponownym logowaniu poprzednia niewygasła sesja przeglądarki jest usuwana i jej token odświeżania jest unieważniany w Core **przed** wymianą kodu na nowe tokeny, żeby ewentualna rotacja starej sesji nie unieważniła nowo wydanej rodziny tokenów. Wygasłych sesji nie unieważniamy ponownie w Core.

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
- Tryb `cookie` wymaga przesyłania odświeżonego ciasteczka przez `auth.withAuth` (albo `applySessionCookies`) w trasach API i przez `proxy.ts` dla Server Components; pominięcie tego kroku po rotacji tokenu odświeżania przerwie sesję przy kolejnym odświeżeniu.
