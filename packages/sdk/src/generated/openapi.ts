/* eslint-disable */
/**
 * Generated from packages/sdk/openapi/core-api.json. Do not edit by hand.
 * Regenerate with: pnpm --filter @monorise-team/sdk generate
 * Sync from MonoriseCore: pnpm --filter @monorise-team/sdk sync
 */
export interface paths {
    "/core/v1/app-access": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista wpisów dostępu kont do aplikacji
         * @description Owner oraz konta z uprawnieniem `core.app_access.manage` (w dowolnym zakresie) widzą wszystkie wpisy firmy; pozostałe aktywne konta widzą wyłącznie własne wpisy. Domyślnie zwraca tylko aktywne dostępy.
         */
        get: operations["listAppAccess"];
        put?: never;
        /**
         * Włącz aplikację pracownikowi
         * @description Włącza aktywnemu kontu dostęp do produktu, do którego firma ma aktywny `Entitlement` (ADR-0035). Wymaga roli Ownera albo uprawnienia `core.app_access.manage` obejmującego jednostki pracownika (dla pracownika bez jednostek — w zakresie całej firmy).
         */
        post: operations["grantAppAccess"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/app-access/{appAccessId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Wyłącz aplikację pracownikowi
         * @description Oznacza dostęp konta do aplikacji jako `REVOKED` (z zachowaniem historii), podbija `authzRevision` i zapisuje zdarzenie `organization.permissions.changed`. Wymaga roli Ownera albo `core.app_access.manage` obejmującego jednostki pracownika.
         */
        delete: operations["revokeAppAccess"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/employees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista pracowników firmy
         * @description Zwraca stronicowaną listę pracowników firmy wynikającej z tokenu dostępu (kolejność utworzenia).
         */
        get: operations["listEmployees"];
        put?: never;
        /**
         * Dodaj pracownika
         * @description Tworzy pracownika firmy (może istnieć bez konta, ADR-0031). Wymaga uprawnienia `core.employees.manage` w zakresie całej firmy albo roli Ownera.
         */
        post: operations["createEmployee"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/entitlements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista dostępów firmy do produktów
         * @description Zwraca stronicowaną, wyłącznie do odczytu listę dostępów firmy do produktów (Entitlements), dostępną dla każdego aktywnego konta firmy.
         */
        get: operations["listEntitlements"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
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
    "/core/v1/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista zaproszeń pracowników firmy
         * @description Zwraca stronicowaną listę zaproszeń pracowników firmy (wygasłe wiersze `PENDING` są raportowane jako `EXPIRED`), opcjonalnie filtrowaną statusem. Wymaga uprawnienia `core.employees.manage` w zakresie całej firmy albo roli Ownera.
         */
        get: operations["listInvitations"];
        put?: never;
        /**
         * Zaproś pracownika e-mailem
         * @description Tworzy konto `INVITED` (dla nowego pracownika albo wskazanego `employeeId` bez konta), generuje jednorazowy link aktywacyjny ważny 7 dni i wysyła wiadomość e-mail (ADR-0021). Adres musi należeć do zweryfikowanej domeny firmy. Wymaga uprawnienia `core.employees.manage` w zakresie całej firmy albo roli Ownera.
         */
        post: operations["createInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/invitations/{invitationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Cofnij oczekujące zaproszenie
         * @description Zmienia status oczekującego zaproszenia z `PENDING` na `REVOKED` (konto pozostaje w statusie `INVITED`, a zaproszenie można później wysłać ponownie). Wymaga uprawnienia `core.employees.manage` w zakresie całej firmy albo roli Ownera.
         */
        delete: operations["revokeInvitation"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/invitations/{invitationId}/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Wyślij ponownie zaproszenie pracownika
         * @description Generuje nowy 7-dniowy link aktywacyjny dla zaproszenia `PENDING`, `EXPIRED` albo `REVOKED` (unieważnia poprzedni link), ustawia status `PENDING` i wysyła nowy e-mail. Wymaga uprawnienia `core.employees.manage` w zakresie całej firmy albo roli Ownera.
         */
        post: operations["resendInvitation"];
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
         * @description Zwraca konto (wraz z informacją `isOwner`), przypisanego pracownika oraz skrócone dane firmy.
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
    "/core/v1/organization/owner": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Przekaż rolę Ownera firmy innemu aktywnemu kontu
         * @description Operacja wyłącznie dla bieżącego Ownera firmy. Docelowe konto musi być aktywnym kontem tej samej firmy i nie może być już Ownerem. Poprzedni Owner zachowuje wyłącznie uprawnienia wynikające z nadanych ról.
         */
        put: operations["transferOrganizationOwner"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista zarejestrowanych uprawnień
         * @description Zwraca stronicowaną listę uprawnień platformy i produktów. Domyślnie pomija wycofane uprawnienia; dostępna dla każdego aktywnego konta firmy.
         */
        get: operations["listPermissions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/products/{productKey}/directory/employees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista podstawowych danych pracowników dla serwera produktu
         * @description Endpoint maszynowy dla serwerów produktów (token OAuth 2.1 `client_credentials` z zakresem `core:directory.read`). Zwraca wyłącznie minimalne pola identyfikacyjne (bez służbowego e-maila i stanowiska). Wymaga zgodności klienta produktu oraz aktywnego dostępu firmy (`Entitlement`).
         */
        get: operations["listProductDirectoryEmployees"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/products/{productKey}/directory/unit-members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista członkostw pracowników w jednostkach dla serwera produktu
         * @description Endpoint maszynowy dla serwerów produktów (token OAuth 2.1 `client_credentials` z zakresem `core:directory.read`). Wymaga zgodności klienta z `products.registrationClientId` oraz aktywnego dostępu firmy (`Entitlement`) do wskazanego produktu. Działa w kontekście RLS wskazanej firmy.
         */
        get: operations["listProductDirectoryUnitMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/products/{productKey}/permission-snapshot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pobierz migawkę uprawnień konta dla produktu
         * @description Endpoint maszynowy dla serwerów produktów (token OAuth 2.1 `client_credentials` z zakresem `core:permissions.read`). Zwraca migawkę uprawnień zgodną ze schematem `permissionSnapshotSchema` z `@monorise-team/permissions`: aktywność produktu dla firmy i konta, wyłącznie nadania uprawnień tego produktu (nigdy `core.*`) oraz pełne drzewo jednostek firmy (łącznie z `ARCHIVED`).
         */
        get: operations["getProductPermissionSnapshot"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/products/{productKey}/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Zarejestruj manifest uprawnień produktu
         * @description Endpoint maszynowy dla serwerów produktów (token OAuth 2.1 `client_credentials` z zakresem `core:permissions.register`). Idempotentnie dodaje i aktualizuje uprawnienia produktu oraz oznacza brakujące jako wycofane (bez usuwania).
         */
        put: operations["registerProductPermissions"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/products/{productKey}/role-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Zarejestruj gotowe role (szablony) produktu
         * @description Endpoint maszynowy dla serwerów produktów (token OAuth 2.1 `client_credentials` z zakresem `core:permissions.register`). Idempotentnie dodaje i aktualizuje szablony ról produktu, archiwizuje brakujące i przywraca ponownie obecne.
         */
        put: operations["registerProductRoleTemplates"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/role-assignments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista przypisań ról w firmie
         * @description Owner oraz konta z uprawnieniem `core.roles.assign` lub `core.roles.manage` (w dowolnym zakresie) widzą wszystkie przypisania firmy; pozostałe konta widzą wyłącznie własne przypisania.
         */
        get: operations["listRoleAssignments"];
        put?: never;
        /**
         * Nadaj rolę kontu w firmie z zakresem i opcjonalnym terminem
         * @description Przypisuje aktywną rolę (firmową albo gotowy szablon) kontu w zakresie `ORGANIZATION`, `UNIT` lub `RESOURCE`. Wymaga roli Ownera albo `core.roles.assign` obejmującego docelowy zakres oraz posiadania każdego uprawnienia roli w tym zakresie (ADR-0035).
         */
        post: operations["createRoleAssignment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/role-assignments/{assignmentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Odbierz przypisanie roli
         * @description Usuwa przypisanie roli i podbija `authzRevision` konta (historia trafia do dziennika zdarzeń). Wymaga tych samych uprawnień co nadanie tego przypisania albo roli Ownera.
         */
        delete: operations["deleteRoleAssignment"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista ról firmy i gotowych szablonów
         * @description Zwraca stronicowaną listę ról firmy wraz z gotowymi szablonami (domyślnie bez ról zarchiwizowanych). Dostępna dla każdego aktywnego konta firmy.
         */
        get: operations["listRoles"];
        put?: never;
        /**
         * Utwórz rolę firmy lub skopiuj istniejącą rolę
         * @description Tworzy własną rolę firmy od zera albo kopiuje gotowy szablon lub istniejącą rolę firmy (`copyFromRoleId`). Wymaga uprawnienia `core.roles.manage` w zakresie całej firmy albo roli Ownera.
         */
        post: operations["createRole"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/roles/{roleId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Pobierz szczegóły roli wraz z kluczami uprawnień
         * @description Zwraca rolę firmy albo gotowy szablon roli wraz z listą jej kluczy uprawnień.
         */
        get: operations["getRole"];
        put?: never;
        post?: never;
        /**
         * Zarchiwizuj rolę firmy
         * @description Archiwizuje rolę firmy (ustawia `archivedAt`). Zwraca `409 CONFLICT`, dopóki rola ma jakiekolwiek przypisania, oraz `403` dla szablonów. Wymaga `core.roles.manage` w zakresie całej firmy albo roli Ownera.
         */
        delete: operations["archiveRole"];
        options?: never;
        head?: never;
        /**
         * Zmień nazwę, opis lub uprawnienia roli firmy
         * @description Aktualizuje aktywną rolę firmy (szablony zwracają `403`). Zmiana listy uprawnień podbija `authzRevision` wszystkich kont z przypisaną tą rolą. Wymaga `core.roles.manage` w zakresie całej firmy albo roli Ownera.
         */
        patch: operations["updateRole"];
        trace?: never;
    };
    "/core/v1/units": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista jednostek organizacyjnych firmy
         * @description Zwraca stronicowaną, płaską listę jednostek organizacyjnych z polem `parentId`, opcjonalnie filtrowaną statusem.
         */
        get: operations["listUnits"];
        put?: never;
        /**
         * Utwórz jednostkę organizacyjną
         * @description Dodaje oddział, dział lub zespół do drzewa struktury firmy (ADR-0032). Wymaga uprawnienia `core.structure.manage` na jednostce nadrzędnej (albo w zakresie całej firmy dla jednostki głównej) lub roli Ownera.
         */
        post: operations["createUnit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/units/{unitId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Zmień jednostkę organizacyjną
         * @description Zmienia nazwę, przenosi jednostkę w drzewie (z kontrolą cykli) albo zmienia jej status (archiwizacja tylko bez aktywnych jednostek podrzędnych). Wymaga uprawnienia `core.structure.manage` na jednostce oraz — przy przenoszeniu — również na nowej jednostce nadrzędnej (lub całej firmie).
         */
        patch: operations["updateUnit"];
        trace?: never;
    };
    "/core/v1/units/{unitId}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lista członków jednostki organizacyjnej
         * @description Zwraca stronicowaną listę pracowników przypisanych do wskazanej jednostki organizacyjnej wraz z ich rolą.
         */
        get: operations["listUnitMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/core/v1/units/{unitId}/members/{employeeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Przypisz pracownika do jednostki lub zmień jego rolę
         * @description Operacja idempotentna: przypisuje pracownika do jednostki albo aktualizuje jego rolę (`MEMBER`/`LEADER`). Wymaga uprawnienia `core.structure.manage` na wskazanej jednostce albo roli Ownera.
         */
        put: operations["putUnitMember"];
        post?: never;
        /**
         * Usuń pracownika z jednostki organizacyjnej
         * @description Usuwa przypisanie pracownika do wskazanej jednostki. Wymaga uprawnienia `core.structure.manage` na tej jednostce albo roli Ownera.
         */
        delete: operations["deleteUnitMember"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        AccountStatus: "INVITED" | "ACTIVE" | "DEACTIVATED";
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
        ApiListMeta: {
            nextCursor: string | null;
            requestId: string;
        };
        ApiMeta: {
            requestId: string;
        };
        AppAccess: {
            /** Format: uuid */
            accountId: string;
            createdAt: string;
            /** Format: uuid */
            grantedByAccountId: string;
            /** Format: uuid */
            id: string;
            product: components["schemas"]["ProductKey"];
            revokedAt: string | null;
            status: components["schemas"]["AppAccessStatus"];
        };
        AppAccessList: components["schemas"]["AppAccess"][];
        AppAccessListResponse: {
            data: components["schemas"]["AppAccessList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        AppAccessResponse: {
            data: components["schemas"]["AppAccess"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        /** @enum {string} */
        AppAccessStatus: "ACTIVE" | "REVOKED";
        CopyRole: {
            /** Format: uuid */
            copyFromRoleId: string;
            description?: string | null;
            name?: string;
        };
        CreateAppAccess: {
            /** Format: uuid */
            accountId: string;
            product: components["schemas"]["ProductKey"];
        };
        CreateEmployee: {
            firstName: string;
            jobTitle?: string;
            lastName: string;
            /** Format: email */
            workEmail?: string;
        };
        CreateInvitation: {
            /** Format: email */
            email: string;
            /** Format: uuid */
            employeeId?: string;
            firstName?: string;
            lastName?: string;
        };
        CreateRole: components["schemas"]["CreateRoleFromScratch"] | components["schemas"]["CopyRole"];
        CreateRoleAssignment: {
            /** Format: uuid */
            accountId: string;
            /** Format: uuid */
            roleId: string;
            scopeId?: string | null;
            scopeType: components["schemas"]["ScopeType"];
            validFrom?: string | null;
            validUntil?: string | null;
        };
        CreateRoleFromScratch: {
            description?: string | null;
            name: string;
            permissions: string[];
            product: components["schemas"]["ProductKey"] | null;
        };
        CreateUnit: {
            name: string;
            parentId?: string | null;
            type: components["schemas"]["UnitType"];
        };
        DirectoryEmployee: {
            accountId: string | null;
            firstName: string;
            /** Format: uuid */
            id: string;
            lastName: string;
            status: components["schemas"]["EmployeeStatus"];
        };
        DirectoryEmployeeList: components["schemas"]["DirectoryEmployee"][];
        DirectoryEmployeeListResponse: {
            data: components["schemas"]["DirectoryEmployeeList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        DirectoryUnitMember: {
            accountId: string | null;
            /** Format: uuid */
            employeeId: string;
            role: components["schemas"]["UnitMembershipRole"];
            /** Format: uuid */
            unitId: string;
        };
        DirectoryUnitMemberList: components["schemas"]["DirectoryUnitMember"][];
        DirectoryUnitMemberListResponse: {
            data: components["schemas"]["DirectoryUnitMemberList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        /** @enum {string} */
        DomainStatus: "PENDING" | "VERIFIED" | "FAILED" | "REVOKED";
        Employee: {
            accountId: string | null;
            firstName: string;
            /** Format: uuid */
            id: string;
            jobTitle: string | null;
            lastName: string;
            status: components["schemas"]["EmployeeStatus"];
            workEmail: string | null;
        };
        EmployeeList: components["schemas"]["Employee"][];
        EmployeeListResponse: {
            data: components["schemas"]["EmployeeList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        EmployeeResponse: {
            data: components["schemas"]["Employee"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        /** @enum {string} */
        EmployeeStatus: "ACTIVE" | "FORMER" | "ANONYMIZED";
        Entitlement: {
            createdAt: string;
            endsAt: string | null;
            /** Format: uuid */
            id: string;
            isActive: boolean;
            planId: string | null;
            product: components["schemas"]["ProductKey"];
            sourceType: components["schemas"]["EntitlementSourceType"];
            startsAt: string;
            status: components["schemas"]["EntitlementStatus"];
            suspendedReason: components["schemas"]["EntitlementSuspendedReason"] | null;
            updatedAt: string;
        };
        EntitlementList: components["schemas"]["Entitlement"][];
        EntitlementListResponse: {
            data: components["schemas"]["EntitlementList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        /** @enum {string} */
        EntitlementSourceType: "CONTRACT" | "SUBSCRIPTION" | "TRIAL" | "MANUAL" | "OFFER" | "PACKAGE";
        /** @enum {string} */
        EntitlementStatus: "ACTIVE" | "SUSPENDED" | "ENDED";
        /** @enum {string} */
        EntitlementSuspendedReason: "OVERDUE";
        /** @enum {string} */
        ErrorCode: "UNAUTHENTICATED" | "PERMISSION_DENIED" | "NOT_FOUND" | "VALIDATION_FAILED" | "RATE_LIMITED" | "CONFLICT" | "EMAIL_DOMAIN_NOT_ALLOWED" | "ORGANIZATION_EXISTS" | "ORGANIZATION_NOT_ACTIVE" | "ACCOUNT_DEACTIVATED" | "INTERNAL";
        GrantScope: {
            /** @constant */
            type: "ORGANIZATION";
        } | {
            /** @constant */
            type: "UNIT";
            /** Format: uuid */
            unitId: string;
        } | {
            resourceId: string;
            /** @constant */
            type: "RESOURCE";
        };
        Health: {
            /** @constant */
            status: "ok";
        };
        HealthResponse: {
            data: components["schemas"]["Health"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        Invitation: {
            acceptedAt: string | null;
            /** Format: uuid */
            accountId: string;
            createdAt: string;
            email: string;
            /** Format: uuid */
            employeeId: string;
            expiresAt: string;
            /** Format: uuid */
            id: string;
            invitedByAccountId: string | null;
            status: components["schemas"]["InvitationStatus"];
            updatedAt: string;
        };
        InvitationList: components["schemas"]["Invitation"][];
        InvitationListResponse: {
            data: components["schemas"]["InvitationList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        InvitationResponse: {
            data: components["schemas"]["Invitation"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        /** @enum {string} */
        InvitationStatus: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
        Me: {
            account: {
                email: string;
                /** Format: uuid */
                id: string;
                isOwner: boolean;
                status: components["schemas"]["AccountStatus"];
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
        OrganizationOwner: {
            /** Format: uuid */
            ownerAccountId: string;
        };
        OrganizationOwnerResponse: {
            data: components["schemas"]["OrganizationOwner"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        OrganizationResponse: {
            data: components["schemas"]["Organization"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        /** @enum {string} */
        OrganizationStatus: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "OFFBOARDING" | "DELETED";
        Permission: {
            deprecated: boolean;
            description: string;
            key: string;
            product: string | null;
        };
        PermissionGrant: {
            permission: string;
            scope: components["schemas"]["GrantScope"];
            validFrom?: string | null;
            validUntil?: string | null;
        };
        PermissionList: components["schemas"]["Permission"][];
        PermissionListResponse: {
            data: components["schemas"]["PermissionList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        PermissionManifestEntry: {
            description: string;
            key: string;
        };
        PermissionSnapshot: {
            /** Format: uuid */
            accountId: string;
            authzRevision: number;
            grants: components["schemas"]["PermissionGrant"][];
            isOwner: boolean;
            /** Format: uuid */
            organizationId: string;
            products: components["schemas"]["ProductKey"][];
            units: components["schemas"]["SnapshotUnit"][];
        };
        PermissionSnapshotResponse: {
            data: components["schemas"]["PermissionSnapshot"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        ProductKey: string;
        PutUnitMember: {
            role: components["schemas"]["UnitMembershipRole"];
        };
        RegisterPermissionsRequest: components["schemas"]["PermissionManifestEntry"][];
        RegisterPermissionsResponse: {
            data: components["schemas"]["RegisterPermissionsResult"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        RegisterPermissionsResult: {
            added: string[];
            deprecated: string[];
            restored: string[];
            unchanged: number;
            updated: string[];
        };
        RegisterRoleTemplatesRequest: components["schemas"]["RoleTemplateManifestEntry"][];
        RegisterRoleTemplatesResponse: {
            data: components["schemas"]["RegisterRoleTemplatesResult"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        RegisterRoleTemplatesResult: {
            added: string[];
            archived: string[];
            restored: string[];
            unchanged: number;
            updated: string[];
        };
        Role: {
            archivedAt: string | null;
            copiedFromRoleId: string | null;
            createdAt: string;
            description: string | null;
            /** Format: uuid */
            id: string;
            isTemplate: boolean;
            key: string | null;
            name: string;
            permissions: string[];
            product: string | null;
            updatedAt: string;
        };
        RoleAssignment: {
            /** Format: uuid */
            accountId: string;
            createdAt: string;
            /** Format: uuid */
            grantedByAccountId: string;
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            roleId: string;
            scopeId: string | null;
            scopeType: components["schemas"]["ScopeType"];
            validFrom: string | null;
            validUntil: string | null;
        };
        RoleAssignmentList: components["schemas"]["RoleAssignment"][];
        RoleAssignmentListResponse: {
            data: components["schemas"]["RoleAssignmentList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        RoleAssignmentResponse: {
            data: components["schemas"]["RoleAssignment"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        RoleList: components["schemas"]["Role"][];
        RoleListResponse: {
            data: components["schemas"]["RoleList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        RoleResponse: {
            data: components["schemas"]["Role"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        RoleTemplateKey: string;
        RoleTemplateManifestEntry: {
            description?: string | null;
            key: components["schemas"]["RoleTemplateKey"];
            name: string;
            permissions: string[];
        };
        /** @enum {string} */
        ScopeType: "ORGANIZATION" | "UNIT" | "RESOURCE";
        SnapshotUnit: {
            /** Format: uuid */
            id: string;
            parentId: string | null;
        };
        TransferOrganizationOwner: {
            /** Format: uuid */
            accountId: string;
        };
        Unit: {
            createdAt: string;
            /** Format: uuid */
            id: string;
            name: string;
            parentId: string | null;
            status: components["schemas"]["UnitStatus"];
            type: components["schemas"]["UnitType"];
            updatedAt: string;
        };
        UnitList: components["schemas"]["Unit"][];
        UnitListResponse: {
            data: components["schemas"]["UnitList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        UnitMember: {
            employee: components["schemas"]["Employee"];
            /** Format: uuid */
            employeeId: string;
            joinedAt: string;
            role: components["schemas"]["UnitMembershipRole"];
            /** Format: uuid */
            unitId: string;
        };
        UnitMemberList: components["schemas"]["UnitMember"][];
        UnitMemberListResponse: {
            data: components["schemas"]["UnitMemberList"];
            error: null;
            meta: components["schemas"]["ApiListMeta"];
        };
        UnitMemberResponse: {
            data: components["schemas"]["UnitMember"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        /** @enum {string} */
        UnitMembershipRole: "MEMBER" | "LEADER";
        UnitResponse: {
            data: components["schemas"]["Unit"];
            error: null;
            meta: components["schemas"]["ApiMeta"];
        };
        /** @enum {string} */
        UnitStatus: "ACTIVE" | "ARCHIVED";
        /** @enum {string} */
        UnitType: "BRANCH" | "DEPARTMENT" | "TEAM";
        UpdateRole: {
            description?: string | null;
            name?: string;
            permissions?: string[];
        };
        UpdateUnit: {
            name?: string;
            parentId?: string | null;
            status?: components["schemas"]["UnitStatus"];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listAppAccess: {
        parameters: {
            query?: {
                /** @description Opcjonalny filtr po identyfikatorze konta (UUID v7). */
                accountId?: string;
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Czy uwzględnić wyłączone dostępy (`REVOKED`) — domyślnie `false`. */
                includeRevoked?: boolean;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Opcjonalny filtr po kluczu produktu (np. `timotime`). */
                product?: components["schemas"]["ProductKey"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy dostępów kont do aplikacji. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppAccessListResponse"];
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
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    grantAppAccess: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Identyfikator konta i klucz produktu. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAppAccess"];
            };
        };
        responses: {
            /** @description Utworzony wpis dostępu konta do aplikacji. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppAccessResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    revokeAppAccess: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator wpisu dostępu konta do aplikacji (UUID v7). */
                appAccessId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dostęp konta do aplikacji został wyłączony. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listEmployees: {
        parameters: {
            query?: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy pracowników firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeListResponse"];
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
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    createEmployee: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Dane nowego pracownika. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEmployee"];
            };
        };
        responses: {
            /** @description Utworzony pracownik. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmployeeResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listEntitlements: {
        parameters: {
            query?: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Opcjonalny filtr statusu dostępu (`ACTIVE`, `SUSPENDED` albo `ENDED`). */
                status?: components["schemas"]["EntitlementStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy dostępów firmy do produktów. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntitlementListResponse"];
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
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listInvitations: {
        parameters: {
            query?: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Opcjonalny filtr statusu zaproszenia (`PENDING`, `ACCEPTED`, `EXPIRED` albo `REVOKED`). */
                status?: components["schemas"]["InvitationStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy zaproszeń pracowników firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationListResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    createInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Adres e-mail oraz imię i nazwisko albo identyfikator istniejącego pracownika bez konta. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateInvitation"];
            };
        };
        responses: {
            /** @description Utworzone zaproszenie (bez tokenu aktywacyjnego). */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    revokeInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator zaproszenia pracownika (UUID v7). */
                invitationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zaproszenie zostało cofnięte. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    resendInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator zaproszenia pracownika (UUID v7). */
                invitationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Zaktualizowane zaproszenie z nowym terminem ważności (bez tokenu aktywacyjnego). */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    transferOrganizationOwner: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Identyfikator docelowego konta nowego Ownera. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransferOrganizationOwner"];
            };
        };
        responses: {
            /** @description Identyfikator nowego Ownera firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrganizationOwnerResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listPermissions: {
        parameters: {
            query?: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Czy uwzględnić wycofane uprawnienia (domyślnie `false`). */
                includeDeprecated?: boolean;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Opcjonalny filtr po kluczu produktu (np. `timotime`) albo `core` dla uprawnień platformy. */
                product?: components["schemas"]["ProductKey"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy zarejestrowanych uprawnień. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PermissionListResponse"];
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
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listProductDirectoryEmployees: {
        parameters: {
            query: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Opcjonalny powtarzalny filtr po identyfikatorach pracowników (maks. 100; brak = wszyscy pracownicy firmy). */
                employeeId?: string[];
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Identyfikator firmy (UUID v7), dla której pobierani są pracownicy. */
                organizationId: string;
            };
            header?: never;
            path: {
                /** @description Klucz produktu zgodny z prefiksem kluczy uprawnień (np. `timotime`). */
                productKey: components["schemas"]["ProductKey"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy podstawowych danych pracowników firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DirectoryEmployeeListResponse"];
                };
            };
            /** @description Brak albo nieważny token dostępu albo wyłączone konto (UNAUTHENTICATED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listProductDirectoryUnitMembers: {
        parameters: {
            query: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Identyfikator firmy (UUID v7), dla której pobierane są członkostwa. */
                organizationId: string;
                /** @description Opcjonalny powtarzalny filtr po identyfikatorach jednostek (maks. 100; brak = wszystkie jednostki firmy). */
                unitId?: string[];
            };
            header?: never;
            path: {
                /** @description Klucz produktu zgodny z prefiksem kluczy uprawnień (np. `timotime`). */
                productKey: components["schemas"]["ProductKey"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy członkostw pracowników w jednostkach firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DirectoryUnitMemberListResponse"];
                };
            };
            /** @description Brak albo nieważny token dostępu albo wyłączone konto (UNAUTHENTICATED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    getProductPermissionSnapshot: {
        parameters: {
            query: {
                /** @description Identyfikator konta pracownika (UUID v7). */
                accountId: string;
                /** @description Identyfikator firmy (UUID v7), w której kontekście pobierana jest migawka. */
                organizationId: string;
            };
            header?: never;
            path: {
                /** @description Klucz produktu zgodny z prefiksem kluczy uprawnień (np. `timotime`). */
                productKey: components["schemas"]["ProductKey"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Migawka uprawnień konta dla wskazanego produktu. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PermissionSnapshotResponse"];
                };
            };
            /** @description Brak albo nieważny token dostępu albo wyłączone konto (UNAUTHENTICATED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    registerProductPermissions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Klucz produktu zgodny z prefiksem kluczy uprawnień (np. `timotime`). */
                productKey: components["schemas"]["ProductKey"];
            };
            cookie?: never;
        };
        /** @description Manifest uprawnień produktu (1–500 pozycji z prefiksem `<productKey>.`). */
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterPermissionsRequest"];
            };
        };
        responses: {
            /** @description Podsumowanie zmian w rejestrze uprawnień produktu. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisterPermissionsResponse"];
                };
            };
            /** @description Brak albo nieważny token dostępu albo wyłączone konto (UNAUTHENTICATED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    registerProductRoleTemplates: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Klucz produktu zgodny z prefiksem kluczy uprawnień (np. `timotime`). */
                productKey: components["schemas"]["ProductKey"];
            };
            cookie?: never;
        };
        /** @description Manifest gotowych ról produktu (klucze z prefiksem `<productKey>.`). */
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRoleTemplatesRequest"];
            };
        };
        responses: {
            /** @description Podsumowanie zmian w gotowych rolach produktu. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegisterRoleTemplatesResponse"];
                };
            };
            /** @description Brak albo nieważny token dostępu albo wyłączone konto (UNAUTHENTICATED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listRoleAssignments: {
        parameters: {
            query?: {
                /** @description Opcjonalny filtr po identyfikatorze konta (UUID v7). */
                accountId?: string;
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Opcjonalny filtr po identyfikatorze roli (UUID v7). */
                roleId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy przypisań ról. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleAssignmentListResponse"];
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
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    createRoleAssignment: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Dane nowego przypisania roli. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateRoleAssignment"];
            };
        };
        responses: {
            /** @description Utworzone przypisanie roli. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleAssignmentResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    deleteRoleAssignment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator przypisania roli (UUID v7). */
                assignmentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Przypisanie roli zostało odebrane. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listRoles: {
        parameters: {
            query?: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Czy uwzględnić zarchiwizowane role — domyślnie `false`. */
                includeArchived?: boolean;
                /** @description Czy uwzględnić gotowe role (szablony) — domyślnie `true`. */
                includeTemplates?: boolean;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Opcjonalny filtr po kluczu produktu (np. `timotime`) albo `core` dla ról platformowych. */
                product?: components["schemas"]["ProductKey"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy ról. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleListResponse"];
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
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    createRole: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Dane nowej roli firmy albo identyfikator kopiowanej roli. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateRole"];
            };
        };
        responses: {
            /** @description Utworzona rola firmy. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    getRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator roli lub gotowego szablonu roli (UUID v7). */
                roleId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Szczegóły roli. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleResponse"];
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
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    archiveRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator roli lub gotowego szablonu roli (UUID v7). */
                roleId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Rola firmy została zarchiwizowana. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    updateRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator roli lub gotowego szablonu roli (UUID v7). */
                roleId: string;
            };
            cookie?: never;
        };
        /** @description Pola roli firmy do aktualizacji. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateRole"];
            };
        };
        responses: {
            /** @description Zaktualizowana rola firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listUnits: {
        parameters: {
            query?: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
                /** @description Opcjonalny filtr statusu jednostki (`ACTIVE` albo `ARCHIVED`). */
                status?: components["schemas"]["UnitStatus"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy jednostek organizacyjnych firmy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnitListResponse"];
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
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    createUnit: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Dane nowej jednostki organizacyjnej. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateUnit"];
            };
        };
        responses: {
            /** @description Utworzona jednostka organizacyjna. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnitResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    updateUnit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator jednostki organizacyjnej (UUID v7). */
                unitId: string;
            };
            cookie?: never;
        };
        /** @description Pola jednostki organizacyjnej do aktualizacji. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateUnit"];
            };
        };
        responses: {
            /** @description Zaktualizowana jednostka organizacyjna. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnitResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    listUnitMembers: {
        parameters: {
            query?: {
                /** @description Nieprzezroczysty kursor następnej strony z pola `meta.nextCursor`. */
                cursor?: string;
                /** @description Liczba elementów na stronie (1–100, domyślnie 50). */
                limit?: number;
            };
            header?: never;
            path: {
                /** @description Identyfikator jednostki organizacyjnej (UUID v7). */
                unitId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Strona listy członków jednostki organizacyjnej. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnitMemberListResponse"];
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
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    putUnitMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator pracownika (UUID v7). */
                employeeId: string;
                /** @description Identyfikator jednostki organizacyjnej (UUID v7). */
                unitId: string;
            };
            cookie?: never;
        };
        /** @description Rola pracownika w jednostce. */
        requestBody: {
            content: {
                "application/json": components["schemas"]["PutUnitMember"];
            };
        };
        responses: {
            /** @description Zapisane członkostwo pracownika w jednostce. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnitMemberResponse"];
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Konflikt stanu zasobu (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
    deleteUnitMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identyfikator pracownika (UUID v7). */
                employeeId: string;
                /** @description Identyfikator jednostki organizacyjnej (UUID v7). */
                unitId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Członkostwo pracownika w jednostce zostało usunięte. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
            /** @description Brak uprawnień (PERMISSION_DENIED). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Nie znaleziono zasobu (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiErrorResponse"];
                };
            };
            /** @description Błędne dane wejściowe (VALIDATION_FAILED). */
            422: {
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
