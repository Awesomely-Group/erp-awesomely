import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../src", import.meta.url));

function ficheros(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) salida.push(...ficheros(p));
    else if (/\.(ts|tsx)$/.test(p)) salida.push(p);
  }
  return salida;
}

const todos = ficheros(RAIZ);
const contenido = new Map(todos.map((f) => [f, readFileSync(f, "utf8")]));

/** Resuelve "@/lib/x" o "./x" a un fichero real. */
function resuelve(desde, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(RAIZ, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(desde), spec);
  else return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (contenido.has(base + ext)) return base + ext;
  }
  return contenido.has(base) ? base : null;
}

/** Imports que traen VALORES (no `import type`). */
function importsDeValor(src) {
  const salida = [];
  const re = /^import\s+(?!type\s)(.+?)\s+from\s+["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(src))) salida.push(m[2]);
  return salida;
}

const usaPrisma = (f) => /from\s+["'](@\/lib\/prisma|\.\/prisma|\.\.\/prisma)["']/.test(contenido.get(f) ?? "");

const clientes = todos.filter((f) => /^\s*["']use client["']/.test(contenido.get(f) ?? ""));

const problemas = [];
for (const cliente of clientes) {
  const visto = new Set();
  const cola = [[cliente, []]];
  while (cola.length) {
    const [f, camino] = cola.shift();
    if (visto.has(f)) continue;
    visto.add(f);
    // Un módulo "use server" corta la cadena ANTES de mirar si usa prisma: Next lo
    // sustituye por un stub RPC en el cliente, así que su código nunca llega al
    // navegador. Que una server action use prisma es exactamente lo normal.
    if (f !== cliente && /^\s*["']use server["']/.test(contenido.get(f) ?? "")) continue;
    if (f !== cliente && usaPrisma(f)) {
      problemas.push({ cliente, camino: [...camino, f] });
      break;
    }
    for (const spec of importsDeValor(contenido.get(f) ?? "")) {
      const destino = resuelve(f, spec);
      if (destino) cola.push([destino, [...camino, f]]);
    }
  }
}

const corto = (f) => f.replace(RAIZ + "/", "");
if (problemas.length === 0) console.log("Ningún componente cliente llega a prisma.");
for (const p of problemas) {
  console.log(`✗ ${corto(p.cliente)}`);
  console.log(`   → ${p.camino.map(corto).join("\n   → ")}`);
}
console.log(`\n${clientes.length} componentes cliente, ${problemas.length} con problema.`);
process.exit(problemas.length === 0 ? 0 : 1);
