import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import { normalizeEmail } from "./sso-allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    // jwt/session (id + role) viven en authConfig, compartidos con src/proxy.ts — ver
    // comentario allí. signIn necesita Prisma, por eso solo está aquí.
    ...authConfig.callbacks,
    async signIn({ user }) {
      const email = normalizeEmail(user.email ?? "");
      if (!email) return false;
      const row = await prisma.ssoAllowedEmail.findUnique({
        where: { email },
      });
      return !!row;
    },
  },
});
