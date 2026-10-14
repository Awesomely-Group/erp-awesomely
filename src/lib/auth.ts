import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import { normalizeEmail } from "./sso-allowlist";

/**
 * Login sin OAuth para desarrollo local, portado de Giro.
 *
 * Hasta ahora las **páginas** se podían abrir en local (el layout se salta el redirect
 * fuera de producción) pero las **rutas de API** no: llaman a `auth()` y devolvían 401.
 * Es decir, se podía mirar la UI pero no ejercitar nada de lo que hace. Con esto, una
 * sesión local de verdad.
 *
 * Doble candado, igual que en Giro: solo existe fuera de producción **y** el email tiene
 * que estar en `SsoAllowedEmail`, exactamente como en el flujo real. En un build de
 * producción este provider no llega a registrarse.
 */
const devCredentials = Credentials({
  id: "dev",
  name: "Desarrollo (solo local)",
  credentials: { email: { label: "Email", type: "email" } },
  async authorize(credentials) {
    const email = normalizeEmail(String(credentials?.email ?? ""));
    if (!email) return null;

    const permitido = await prisma.ssoAllowedEmail.findUnique({ where: { email } });
    if (!permitido) return null;

    // Con Credentials el adapter no interviene, así que el User se busca aquí.
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  },
});

const providers = [
  ...authConfig.providers,
  ...(process.env.NODE_ENV === "production" ? [] : [devCredentials]),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    // jwt/session (id + role) viven en authConfig, compartidos con src/proxy.ts — ver
    // comentario allí. signIn necesita Prisma, por eso solo está aquí.
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // El provider de desarrollo ya comprobó la allowlist en su `authorize`, y no trae
      // un email verificado por un proveedor externo que volver a mirar.
      if (account?.provider === "dev") return true;

      const email = normalizeEmail(user.email ?? "");
      if (!email) return false;
      const row = await prisma.ssoAllowedEmail.findUnique({
        where: { email },
      });
      return !!row;
    },
  },
});
