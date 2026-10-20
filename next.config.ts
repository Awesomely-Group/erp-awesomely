import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `pg` —que usa `@prisma/adapter-pg` para hablar con un Postgres normal— hace
   * `require("dns")`, `require("net")` y `require("fs")`. Declararlo externo deja que se
   * cargue como módulo de Node en el servidor en vez de intentar empaquetarlo.
   */
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
