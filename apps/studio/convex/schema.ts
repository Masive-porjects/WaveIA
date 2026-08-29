import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Fuente de verdad del modelo de datos de Convex (PLAN.md §4 — Tomás).
 * Contrato espejo: packages/contracts/project_state.schema.json
 * No editar a mano si ese contrato cambia — regenerar juntos.
 */

const jobStatus = v.union(
  v.literal("idle"),
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
);

export default defineSchema({
  // Tablas de Convex Auth (users, authAccounts, authSessions, etc.)
  ...authTables,

  projects: defineTable({
    userId: v.id("users"),
    name: v.string(),

    // Convex Storage — el audio nunca viaja como payload de función (PLAN.md D1)
    audioFileId: v.optional(v.id("_storage")),
    masteredFileId: v.optional(v.id("_storage")),

    // Capas de parámetros — nunca mezcladas (PLAN.md D2)
    intentProfile: v.optional(v.any()), // ver packages/contracts/intent_profile.schema.json (Miguel)
    masteringSettings: v.optional(v.any()), // ver packages/contracts/mastering_settings.schema.json (Brickman)

    job: v.object({
      status: jobStatus,
      progress: v.number(), // 0..1
      error: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      finishedAt: v.optional(v.number()),
    }),

    result: v.optional(
      v.object({
        integrated_lufs: v.optional(v.number()),
        true_peak_db: v.optional(v.number()),
        crest_factor_db: v.optional(v.number()),
        duration_seconds: v.optional(v.number()),
        sample_rate: v.optional(v.number()),
      }),
    ),
  }).index("by_user", ["userId"]),

  messages: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  }).index("by_project", ["projectId"]),
});
