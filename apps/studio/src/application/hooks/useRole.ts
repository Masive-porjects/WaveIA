"use client";

import { useState } from "react";
import { type UserRole, DEFAULT_ROLE } from "@/core/roles";

const ROLE_KEY = "waveai-role";

export interface UseRoleReturn {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

export function useRole(): UseRoleReturn {
  const [role, setRoleState] = useState<UserRole>(() => {
    if (typeof window === "undefined") return DEFAULT_ROLE;
    const saved = localStorage.getItem(ROLE_KEY) as UserRole | null;
    return saved === "basic" || saved === "premium" ? saved : DEFAULT_ROLE;
  });

  const setRole = (next: UserRole) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ROLE_KEY, next);
    }
    setRoleState(next);
  };

  return { role, setRole };
}
