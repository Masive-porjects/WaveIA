import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

/**
 * Todo lo que toca `projects` filtra por el usuario autenticado.
 * Regla de "listo" (PLAN.md §4): dos usuarios distintos no ven los proyectos del otro.
 */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) return null;
    return project;
  },
});

export const create = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("No autenticado");
    return await ctx.db.insert("projects", {
      userId,
      name: name ?? "Sin título",
      job: { status: "idle", progress: 0 },
    });
  },
});

export const rename = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, { projectId, name }) => {
    const userId = await getAuthUserId(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) throw new Error("No autorizado");
    await ctx.db.patch(projectId, { name });
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) throw new Error("No autorizado");
    await ctx.db.delete(projectId);
  },
});

/** Paso 1 del upload: el cliente pide una URL firmada de Convex Storage. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("No autenticado");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Paso 2 del upload: el cliente sube el archivo con esa URL y guarda el storageId acá. */
export const attachAudio = mutation({
  args: { projectId: v.id("projects"), storageId: v.id("_storage") },
  handler: async (ctx, { projectId, storageId }) => {
    const userId = await getAuthUserId(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) throw new Error("No autorizado");
    await ctx.db.patch(projectId, { audioFileId: storageId });
  },
});

/** El dashboard escribe acá cuando el usuario ajusta perillas o aplica un preset (PLAN.md D4). */
export const setMasteringSettings = mutation({
  args: { projectId: v.id("projects"), masteringSettings: v.any() },
  handler: async (ctx, { projectId, masteringSettings }) => {
    const userId = await getAuthUserId(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) throw new Error("No autorizado");
    await ctx.db.patch(projectId, { masteringSettings });
  },
});
