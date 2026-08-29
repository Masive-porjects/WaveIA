import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * D1 (PLAN.md): Convex orquesta, AudioMind ejecuta.
 * Esta action NUNCA manda el audio como payload — le pasa a AudioMind
 * una URL firmada de Convex Storage y espera { mastered_url, metrics }.
 *
 * Contrato esperado del lado de AudioMind (Brickman):
 *   POST {AUDIOMIND_URL}/api/master
 *   body:  { audio_url: string, settings: MasteringSettings }
 *   resp:  { mastered_url: string, metrics: { integrated_lufs, true_peak_db, ... } }
 *
 * Idempotente: si el proyecto ya tiene un job en "pending"/"processing",
 * no dispara otro (regla de "listo": 3 clicks en Procesar → un solo job).
 */
export const startMastering = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("No autenticado");

    const project = await ctx.runQuery(internal.mastering.getOwnedProject, {
      projectId,
      userId,
    });
    if (!project) throw new Error("Proyecto no encontrado");

    if (project.job.status === "pending" || project.job.status === "processing") {
      return { started: false as const, status: project.job.status };
    }
    if (!project.audioFileId) {
      throw new Error("El proyecto no tiene audio subido todavía");
    }

    const audiomindUrl = process.env.AUDIOMIND_URL;
    if (!audiomindUrl) {
      throw new Error(
        "Falta AUDIOMIND_URL — configurala con `npx convex env set AUDIOMIND_URL https://...`",
      );
    }

    await ctx.runMutation(internal.mastering.setJobStatus, {
      projectId,
      status: "pending",
      progress: 0,
      startedAt: Date.now(),
    });

    const audioUrl = await ctx.storage.getUrl(project.audioFileId);
    if (!audioUrl) throw new Error("No se pudo generar la URL firmada del audio original");

    try {
      await ctx.runMutation(internal.mastering.setJobStatus, {
        projectId,
        status: "processing",
        progress: 0.1,
      });

      const res = await fetch(`${audiomindUrl}/api/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_url: audioUrl,
          settings: project.masteringSettings ?? {},
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`AudioMind respondió ${res.status}: ${detail}`);
      }

      const body = (await res.json()) as {
        mastered_url: string;
        metrics?: Record<string, number | null>;
      };

      const masteredRes = await fetch(body.mastered_url);
      if (!masteredRes.ok) throw new Error("No se pudo descargar el master resultante");
      const masteredBlob = await masteredRes.blob();
      const masteredFileId = await ctx.storage.store(masteredBlob);

      await ctx.runMutation(internal.mastering.setJobResult, {
        projectId,
        masteredFileId,
        result: body.metrics ?? undefined,
      });

      return { started: true as const, status: "completed" as const };
    } catch (err) {
      await ctx.runMutation(internal.mastering.setJobStatus, {
        projectId,
        status: "failed",
        progress: 0,
        error: err instanceof Error ? err.message : String(err),
        finishedAt: Date.now(),
      });
      throw err;
    }
  },
});

export const getOwnedProject = internalQuery({
  args: { projectId: v.id("projects"), userId: v.id("users") },
  handler: async (ctx, { projectId, userId }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) return null;
    return project;
  },
});

export const setJobStatus = internalMutation({
  args: {
    projectId: v.id("projects"),
    status: v.union(
      v.literal("idle"),
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    progress: v.number(),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, ...patch }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return;
    await ctx.db.patch(projectId, { job: { ...project.job, ...patch } });
  },
});

export const setJobResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    masteredFileId: v.id("_storage"),
    result: v.optional(v.any()),
  },
  handler: async (ctx, { projectId, masteredFileId, result }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return;
    await ctx.db.patch(projectId, {
      masteredFileId,
      result,
      job: { ...project.job, status: "completed", progress: 1, finishedAt: Date.now() },
    });
  },
});
