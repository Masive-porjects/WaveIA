import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const errorCode = searchParams.get("error_code");

  // If OAuth provider returned an explicit error (e.g. unverified email, access denied)
  if (oauthError || errorCode) {
    const msg = errorDescription || errorCode || oauthError || "auth_callback_failed";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Auto-provision user profile into public.profiles automatically
      const user = sessionData?.user;
      if (user) {
        console.log("[AUTH CALLBACK] User ID:", user.id);
        console.log("[AUTH CALLBACK] Email directly on user:", user.email);
        console.log("[AUTH CALLBACK] User metadata:", JSON.stringify(user.user_metadata));
        console.log("[AUTH CALLBACK] Identities:", JSON.stringify(user.identities));

        const displayName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Producer";
        const avatarUrl =
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          null;

        const resolvedEmail =
          user.email ||
          (user.user_metadata?.email as string | undefined) ||
          (user.identities?.find((id) => id.identity_data?.email)?.identity_data?.email as string | undefined) ||
          null;

        try {
          await supabase.from("profiles").upsert(
            {
              id: user.id,
              email: resolvedEmail,
              display_name: displayName,
              avatar_url: avatarUrl,
              role: "user",
            },
            { onConflict: "id", ignoreDuplicates: true }
          );
        } catch {
          // Non-blocking if table is being created
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } else {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }
  }

  // Fallback if no code and no specific error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
