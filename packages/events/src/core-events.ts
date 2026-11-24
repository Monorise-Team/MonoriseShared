import { z } from "zod";
import { defineEvent, defineEventCatalog } from "./define.js";

/**
 * Emitted by Core when permissions in an organization change (`05-integration/events.md`).
 * Consumers react by invalidating their local permission cache for `organizationId`.
 */
export const organizationPermissionsChanged = defineEvent({
  type: "organization.permissions.changed",
  version: 1,
  data: z.object({
    authzRevision: z.number().int().nonnegative(),
  }),
});

/** Catalog of Core events whose data schemas are defined in documentation. */
export const coreEvents = defineEventCatalog([organizationPermissionsChanged]);
