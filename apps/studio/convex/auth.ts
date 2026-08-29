import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

/**
 * Auth mínima para el hackathon: email + contraseña.
 * Se puede sumar un OAuth provider (GitHub/Google) después sin tocar el schema.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
