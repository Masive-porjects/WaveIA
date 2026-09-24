import { createClient } from "@/lib/supabase/client";
import type { AdminUser, RoleAuditLog, RoleUpdateResult } from "../types";

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as AdminUser[];
}

export async function updateUserRole(
  targetUserId: string,
  newRole: string
): Promise<RoleUpdateResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_user_role", {
    target_user_id: targetUserId,
    new_role: newRole,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as RoleUpdateResult;
}

export async function fetchRoleAuditLogs(): Promise<RoleAuditLog[]> {
  const supabase = createClient();
  
  // Try RPC first for joined names and emails
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_role_audit_history"
  );

  if (!rpcError && rpcData) {
    return rpcData as RoleAuditLog[];
  }

  // Fallback direct table query
  const { data, error } = await supabase
    .from("role_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return [];
  }

  return (data || []) as RoleAuditLog[];
}
