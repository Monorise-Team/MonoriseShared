/* eslint-disable */
/**
 * Generated from packages/sdk/openapi/core-api.json. Do not edit by hand.
 * Regenerate with: pnpm --filter @monorise-team/sdk generate
 * Sync from MonoriseCore: pnpm --filter @monorise-team/sdk sync
 */
export interface paths {
    "/core/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Sprawdź stan Core API
         * @description Publiczny punkt kontrolny do sprawdzania dostępności usługi. Nie wymaga tokenu dostępu.
         */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pobierz dane zalogowanego konta, pracownika i firmy
         * @description Zwraca konto, przypisanego pracownika oraz skrócone dane firmy wynikające z tokenu dostępu.
         */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pobierz opis OpenAPI 3.1 Core API
         * @description Zwraca wygenerowany z kodu dokument OpenAPI 3.1 w formacie JSON. Wyjątek od standardu: odpowiedź to surowy dokument OpenAPI (bez koperty `{ data, meta, error }`), dzięki czemu narzędzia i generatory SDK mogą go wczytać bezpośrednio.
         */
        get: operations["getOpenApi"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/organization": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pobierz firmę zalogowanego użytkownika
         * @description Zwraca firmę wynikającą z tokenu dostępu wraz z listą jej domen posortowaną według daty dodania.
         */
        get: operations["getOrganization"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ApiErrorBody: {
            code: components["schemas"]["ErrorCode"];
            details: components["schemas"]["ApiErrorDetail"][];
            message: string;
        };
        ApiErrorDetail: {
            field?: string;
            message: string;
        };
        ApiErrorResponse: {
            data: null;
            error: components["schemas"]["ApiErrorBody"];
            meta: components["schemas"]["ApiMeta"];
        };
        ApiMeta: {
            requestId: string;
        };
        /** @enum {string} */
        DomainStatus: "PENDING" | "VERIFIED" | "FAILED" | "REVOKED";
        Employee: {
            firstName: string;
            /** Format: uuid */
            id: string;
            jobTitle: string | null;
            lastName: string;
            /** @enum {string} */
            status: "ACTIVE" | "FORMER" | "ANONYMIZED";
            workEmail: string | null;
        };
        /** @enum {string} */
        ErrorCode: "UNAUTHENTICATED" | "PERMISSION_DENIED" | "NOT_FOUND" | "VALIDATION_FAILED" | "RATE_LIMITED" | "CONFLICT" | "EMAIL_DOMAIN_NOT_ALLOWED" | "ORGANIZATION_EXISTS" | "ORGANIZATION_NOT_ACTIVE" | "ACCOUNT_DEACTIVATED" | "INTERNAL";
        Health: {
            /** @constant */
            status: "ok";
        };
        HealthResponse: {
            data: components["schemas"]["Health"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        Me: {
            account: {
                email: string;
                /** Format: uuid */
                id: string;
                /** @enum {string} */
                status: "INVITED" | "ACTIVE" | "DEACTIVATED";
            };
            employee: components["schemas"]["Employee"];
            organization: {
                /** Format: uuid */
                id: string;
                name: string;
                status: components["schemas"]["OrganizationStatus"];
            };
        };
        MeResponse: {
            data: components["schemas"]["Me"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        OpenApiDocument: {
            info: {
                title: string;
                version: string;
            } & {
                [key: string]: unknown;
            };
            openapi: string;
            paths: {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        };
        Organization: {
            createdAt: string;
            domains: components["schemas"]["OrganizationDomain"][];
            /** Format: uuid */
            id: string;
            name: string;
            status: components["schemas"]["OrganizationStatus"];
        };
        OrganizationDomain: {
            domain: string;
            isPrimary: boolean;
            status: components["schemas"]["DomainStatus"];
            verifiedAt: string | null;
        };
        OrganizationResponse: {
            data: components["schemas"]["Organization"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        /** @enum {string} */
        OrganizationStatus: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "OFFBOARDING" | "DELETED";
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Core API działa poprawnie. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthResponse"];
                };
            };
            /** @description Wewnętrzny błąd serwera (INTERNAL). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dane zalogowanego konta, pracownika i firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            /** @description Brak albo nieważny token dostępu albo wyłączone konto (UNAUTHENTICATED, ACCOUNT_DEACTIVATED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Wewnętrzny błąd serwera (INTERNAL). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
        };
    };
    getOpenApi: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dokument OpenAPI 3.1 w formacie JSON (bez koperty). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenApiDocument"];
                };
            };
            /** @description Wewnętrzny błąd serwera (INTERNAL). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
        };
    };
    getOrganization: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dane firmy wraz z listą domen. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganizationResponse"];
                };
            };
            /** @description Brak albo nieważny token dostępu albo wyłączone konto (UNAUTHENTICATED, ACCOUNT_DEACTIVATED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Wewnętrzny błąd serwera (INTERNAL). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
        };
    };
}
