"use client";

import { useEffect, useState } from "react";
import { type UserRole, DEFAULT_ROLE } from "@/core/roles";

const ROLE_KEY = "waveai-role";

export interface UseRoleReturn {
  role: UserRole;
  setRole: (role: UserRole) => void;
}

export function useRole(): UseRoleReturn {
  const [role, setRoleState] = useState<UserRole>(DEFAULT_ROLE);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem(ROLE_KEY) as UserRole | null) : null;
    if (saved === "basic" || saved === "premium") {
      setRoleState(saved);
    }
  }, []);

  const setRole = (next: UserRole) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ROLE_KEY, next);
    }
    setRoleState(next);
  };

  return { role, setRole };
}
