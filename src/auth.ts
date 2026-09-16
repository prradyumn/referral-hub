import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const ALLOWED_EMAIL_DOMAIN =
  process.env.ALLOWED_EMAIL_DOMAIN ?? "convegenius.ai";

function isWorkAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().split("@")[1] === ALLOWED_EMAIL_DOMAIN.toLowerCase();
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // Pre-filters the account chooser to the work domain. A hint, not a
          // control — signIn() below is the control.
          hd: ALLOWED_EMAIL_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
  ],

  // JWT sessions: no adapter, no session table. The employees row is upserted
  // separately by currentEmployee(), which runs in a Node context where pg works.
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    // The domain gate. Deliberately a pure string check with no database access,
    // so this stays safe to evaluate in the edge runtime the proxy uses.
    signIn({ profile, user }) {
      const email = profile?.email ?? user?.email;
      if (!isWorkAddress(email)) return "/login?error=AccessDenied";
      // Google says so, and the consent screen is Internal — but a verified flag
      // that is explicitly false is still worth refusing.
      if (profile && profile.email_verified === false) return "/login?error=AccessDenied";
      return true;
    },

    jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email.toLowerCase();
      if (profile?.name) token.name = profile.name;
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string) ?? session.user.name;
      }
      return session;
    },
  },

  // Vercel terminates TLS at the edge; without this Auth.js can build callback
  // URLs from the internal host and the OAuth redirect fails.
  trustHost: true,
});
