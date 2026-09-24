"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { AuthContextType, UserProfile } from "../types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string, currentUser?: User) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile({
          id: data.id,
          email: data.email,
          display_name: data.display_name,
          avatar_url: data.avatar_url,
          role: (data.role as UserProfile["role"]) || "user",
          created_at: data.created_at,
          updated_at: data.updated_at,
        });
      } else {
        // Fallback to user metadata if profile row isn't ready
        setProfile({
          id: userId,
          email: currentUser?.email || null,
          display_name:
            currentUser?.user_metadata?.full_name ||
            currentUser?.user_metadata?.name ||
            currentUser?.email?.split("@")[0] ||
            "Producer",
          avatar_url: currentUser?.user_metadata?.avatar_url || null,
          role:
            (currentUser?.app_metadata?.role as UserProfile["role"]) ||
            (currentUser?.user_metadata?.role as UserProfile["role"]) ||
            "user",
        });
      }
    } catch {
      // Graceful fallback
      if (currentUser) {
        setProfile({
          id: userId,
          email: currentUser.email || null,
          display_name: currentUser.email?.split("@")[0] || "Producer",
          avatar_url: null,
          role: "user",
        });
      }
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, user);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (isMounted) {
          const activeUser = session?.user ?? null;
          setUser(activeUser);
          if (activeUser) {
            await fetchProfile(activeUser.id, activeUser);
          } else {
            setProfile(null);
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        const activeUser = session?.user ?? null;
      setUser(activeUser);
      if (activeUser) {
        await fetchProfile(activeUser.id, activeUser);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  }, [supabase]);

  const rawRole =
    profile?.role ||
    (user?.app_metadata?.role as string) ||
    (user?.user_metadata?.role as string) ||
    "user";
  const role: UserProfile["role"] =
    typeof rawRole === "string" && rawRole.trim().toLowerCase() === "admin"
      ? "admin"
      : "user";
  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAdmin,
        isLoading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
