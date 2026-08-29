import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

/**
 * Memoria de conversación por proyecto — persiste en Convex, no en RAM
 * (PLAN.md, entregable 4 de Miguel). Miguel llama a `send` desde su action
 * del agente; esta capa solo valida dueño del proyecto y guarda.
 */

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("asc")
      .collect();
  },
});

export const send = mutation({
  args: {
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, { projectId, role, content }) => {
    const userId = await getAuthUserId(ctx);
    const project = await ctx.db.get(projectId);
    if (!project || project.userId !== userId) throw new Error("No autorizado");
    return await ctx.db.insert("messages", { projectId, userId, role, content });
  },
});
