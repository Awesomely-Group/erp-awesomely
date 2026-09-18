import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { UserRole } from "@prisma/client";

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_TENANT_ID ?? "common"}/v2.0`,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  // `id`/`role` viven aquí (no solo en src/lib/auth.ts) porque src/proxy.ts construye su
  // propia instancia de NextAuth a partir de authConfig sin el adaptador de Prisma (para
  // ser edge-safe) — necesita estos mismos callbacks para poder leer `req.auth.user.role`
  // y aplicar el guard de Growth (D8, revisión 2026-09-18). No hacen llamadas a BD: solo
  // copian campos que ya vienen en `user` (del adapter) o en el propio `token`.
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = (token.role as UserRole | undefined) ?? "ADMIN";
      return session;
    },
  },
} satisfies NextAuthConfig;
