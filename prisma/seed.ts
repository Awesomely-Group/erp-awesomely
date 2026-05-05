import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ENTRIES = [
  // ─── REVENUE ──────────────────────────────────────────────────────────────────
  { tag: "REV:Proyecto:Outsourcing",   l1: "REVENUE", description: "Externalización de servicios",                               accountNumSL: "70500000", accountNameSL: "705 Prestación de servicios",                    accountNumOU: "42200100", accountNameOU: "3000 Service Revenue" },
  { tag: "REV:Proyecto:Consulting",    l1: "REVENUE", description: "Desarrollo a medida, integraciones, automatizaciones",        accountNumSL: "70500001", accountNameSL: "705 Prestación de servicios",                    accountNumOU: "42200200", accountNameOU: "3000 Service Revenue" },
  { tag: "REV:Proyecto:Software",      l1: "REVENUE", description: "CTO as a Service, auditorías, workshops, procesos",           accountNumSL: "70500002", accountNameSL: "705 Prestación de servicios",                    accountNumOU: "42200300", accountNameOU: "3000 Service Revenue" },
  { tag: "REV:Proyecto:Mantenimiento", l1: "REVENUE", description: "Mantenimiento de desarrollos realizados",                     accountNumSL: "70500003", accountNameSL: "705 Prestación de servicios",                    accountNumOU: "42200400", accountNameOU: "3000 Service Revenue" },

  // ─── COGS ─────────────────────────────────────────────────────────────────────
  { tag: "COGS:Subcontrata",           l1: "COGS",    description: "Freelance / estudios externos imputables a un proyecto",      accountNumSL: "62300000", accountNameSL: "623 Servicios profesionales independientes",     accountNumOU: "52300100", accountNameOU: "4370 Consultations, trainings" },
  { tag: "COGS:LicenciasProyecto",     l1: "COGS",    description: "Seats/licencias compradas solo para ese cliente/obra",        accountNumSL: "62900001", accountNameSL: "206 Aplicaciones informáticas",                  accountNumOU: "51400700", accountNameOU: "4320 IT services" },
  { tag: "COGS:CloudCliente",          l1: "COGS",    description: "AWS/GCP/Azure atribuible al cliente (compute/DB/CDN/SMS…)",   accountNumSL: "62100002", accountNameSL: "629 Otros servicios",                           accountNumOU: "51400800", accountNameOU: "4320 IT services" },
  { tag: "COGS:ViajesFacturables",     l1: "COGS",    description: "Desplazamientos y dietas imputables y repercutibles",         accountNumSL: "62900003", accountNameSL: "629 Otros servicios",                           accountNumOU: "51500100", accountNameOU: "4040 Other services (operating)" },
  { tag: "COGS:ComisionProyecto",      l1: "COGS",    description: "Comisiones a partners/agentes ligadas al deal",               accountNumSL: "62700000", accountNameSL: "627 Publicidad, propaganda y relaciones públicas", accountNumOU: "51400900", accountNameOU: "4300 Advertising expenses" },
  { tag: "COGS:Render/Plotter",        l1: "COGS",    description: "Render, ploteo, materiales entregables del cliente (LaTroupe)", accountNumSL: null,     accountNameSL: "629 Otros servicios",                           accountNumOU: null,       accountNameOU: null },
  { tag: "COGS:OtrosDirectos",         l1: "COGS",    description: "Otros costes directos de proyecto no clasificados",           accountNumSL: null,       accountNameSL: "629 Otros servicios",                           accountNumOU: null,       accountNameOU: null },

  // ─── OPEX — Talento / Estructura ──────────────────────────────────────────────
  { tag: "OPEX:Payroll:Dirección",           l1: "OPEX", description: "Salarios + SS + beneficios del equipo directivo",                       accountNumSL: "64000100", accountNameSL: "640 Sueldos y salarios",                       accountNumOU: "51100000", accountNameOU: "5000 Salaries" },
  { tag: "OPEX:Payroll:SS",                  l1: "OPEX", description: "Seguridad social a cargo de la empresa",                                 accountNumSL: "64200100", accountNameSL: "642 Seguridad Social",                         accountNumOU: "51200000", accountNameOU: "5100 Social Tax" },
  { tag: "OPEX:ViajesNoFact",                l1: "OPEX", description: "Viajes/comidas internas/comerciales no repercutibles",                    accountNumSL: "62900100", accountNameSL: "629 Otros servicios",                          accountNumOU: "51500200", accountNameOU: "4395 Other operating expenses" },
  { tag: "OPEX:Seguros",                     l1: "OPEX", description: "Primas de seguros (salud personal, RC profesional, equipos)",             accountNumSL: "62500100", accountNameSL: "625 Primas de seguros",                        accountNumOU: "51401000", accountNameOU: "4395 Other operating expenses" },
  { tag: "OPEX:Recruiting",                  l1: "OPEX", description: "Headhunters, portales, bonus de contratación",                            accountNumSL: "62300600", accountNameSL: "623 Servicios profesionales",                   accountNumOU: "52300500", accountNameOU: "4370 Consultations, trainings" },
  { tag: "OPEX:Formacion",                   l1: "OPEX", description: "Cursos, certificaciones, PRL, reconocimientos médicos",                   accountNumSL: "62300601", accountNameSL: "649 Otros gastos sociales",                    accountNumOU: "52300600", accountNameOU: "4370 Consultations, trainings" },
  { tag: "OPEX:OtrosServiciosPersonal",      l1: "OPEX", description: "Regalos, eventos empleados, etc.",                                        accountNumSL: "62900600", accountNameSL: "649 Otros gastos sociales",                    accountNumOU: "51300000", accountNameOU: null },

  // ─── OPEX — Tools (SaaS & Cloud) ──────────────────────────────────────────────
  { tag: "OPEX:SaaS:Productividad",          l1: "OPEX", description: "Google Workspace, Notion, Atlassian, Holded, ReadAI",                     accountNumSL: "62900200", accountNameSL: "628 Otros servicios",                          accountNumOU: "51400100", accountNameOU: "4320 IT services" },
  { tag: "OPEX:SaaS:Desarrollo",             l1: "OPEX", description: "Revit, GitHub/GitLab, Figma, Adobe",                                      accountNumSL: "62900201", accountNameSL: "628 Otros servicios",                          accountNumOU: "51400200", accountNameOU: "4320 IT services" },
  { tag: "OPEX:CloudCompartido",             l1: "OPEX", description: "Infra común no trazable a un cliente (Hetzner, GCP general)",              accountNumSL: "62900202", accountNameSL: "628 Otros servicios",                          accountNumOU: "51400300", accountNameOU: "4320 IT services" },

  // ─── OPEX — Comercial & Marketing ─────────────────────────────────────────────
  { tag: "OPEX:Marketing:Ads",               l1: "OPEX", description: "Google Ads / LinkedIn / Meta",                                            accountNumSL: "62700300", accountNameSL: "627 Publicidad y propaganda",                  accountNumOU: "52200100", accountNameOU: "4300 Advertising expenses" },
  { tag: "OPEX:Marketing:Web",               l1: "OPEX", description: "Hosting, plugins, dominios corporativos",                                 accountNumSL: "62900300", accountNameSL: "628 Otros servicios",                          accountNumOU: "51400400", accountNameOU: "4320 IT services" },
  { tag: "OPEX:Marketing:Comunicacion",      l1: "OPEX", description: "CMO / copy, gráfico, vídeo, traducciones",                                accountNumSL: "62300300", accountNameSL: "627 Publicidad y propaganda",                  accountNumOU: "52300200", accountNameOU: "4300 Advertising expenses" },
  { tag: "OPEX:Ventas:Herramientas",         l1: "OPEX", description: "CRM, Apollo",                                                             accountNumSL: "62900301", accountNameSL: "628 Otros servicios",                          accountNumOU: "51400500", accountNameOU: "4320 IT services" },
  { tag: "OPEX:Ventas:Networking",           l1: "OPEX", description: "Juno, NoBullshit, eventos, networking",                                   accountNumSL: "62700302", accountNameSL: "628 Otros servicios",                          accountNumOU: "52200200", accountNameOU: "4395 Other operating expenses" },

  // ─── OPEX — Oficina & IT ──────────────────────────────────────────────────────
  { tag: "OPEX:Oficina:Coworking",           l1: "OPEX", description: "Espacio de oficina / coworking",                                          accountNumSL: "62100400", accountNameSL: "621 Arrendamientos y cánones",                  accountNumOU: "51700000", accountNameOU: "4395 Other operating expenses" },
  { tag: "OPEX:IT:Telecom",                  l1: "OPEX", description: "Internet, móviles, telefonía/VoIP",                                       accountNumSL: "62800400", accountNameSL: "628 Otros servicios",                          accountNumOU: "51400600", accountNameOU: "4310 Telephone, Internet" },
  { tag: "OPEX:IT:Soporte",                  l1: "OPEX", description: "Mantenimiento IT, reparaciones",                                          accountNumSL: "62200400", accountNameSL: "628 Otros servicios",                          accountNumOU: "51402000", accountNameOU: "4320 IT services" },

  // ─── OPEX — Profesionales, Banca & Compliance ─────────────────────────────────
  { tag: "OPEX:ServiciosProf",               l1: "OPEX", description: "Asesoría fiscal/contable/laboral, auditoría, legal, freelances admin",     accountNumSL: "62300500", accountNameSL: "623 Servicios profesionales",                  accountNumOU: "52300300", accountNameOU: "4370 Consultations, trainings" },
  { tag: "OPEX:Banca/TPV/FX",               l1: "OPEX", description: "Comisiones bancarias, Stripe/PayPal, FX, intereses",                      accountNumSL: "62600500", accountNameSL: "626 Servicios bancarios y similares",           accountNumOU: "52300700", accountNameOU: "4395 Other operating expenses" },
  { tag: "OPEX:Compliance",                  l1: "OPEX", description: "RGPD/DPO, ISO 27001/ENS, pentesting recurrente",                          accountNumSL: "62300501", accountNameSL: "623 Servicios profesionales",                   accountNumOU: "52300400", accountNameOU: "4370 Consultations, trainings" },
  { tag: "OPEX:Impuestos/Tasas",             l1: "OPEX", description: "Tasas no repercutibles (IS fuera del EBITDA operativo)",                   accountNumSL: "63100500", accountNameSL: "631 Otros tributos",                           accountNumOU: "51800000", accountNameOU: "4395 Other operating expenses" },

  // ─── CAPEX ────────────────────────────────────────────────────────────────────
  { tag: "CAPEX:Equipos",           l1: "CAPEX", description: "Portátiles, estaciones, monitores, servidores propios",               accountNumSL: null, accountNameSL: "217 Equipos para procesos de información",       accountNumOU: null, accountNameOU: "1240 Tangible fixed assets" },
  { tag: "CAPEX:Oficina/Mejoras",   l1: "CAPEX", description: "Mobiliario, adecuaciones del espacio",                                accountNumSL: null, accountNameSL: "216/218 Mobiliario / Otro inmovilizado material", accountNumOU: null, accountNameOU: "1250 Office furniture & improvements" },
  { tag: "CAPEX:SoftwarePropio",    l1: "CAPEX", description: "Desarrollo de IP propia capitalizable",                               accountNumSL: null, accountNameSL: "206/203 Aplicaciones informáticas",               accountNumOU: null, accountNameOU: "1130 Intangible assets: Development" },
  { tag: "CAPEX:LicenciasPerpetuas",l1: "CAPEX", description: "Licencias de uso indefinido / long-term",                            accountNumSL: null, accountNameSL: "206 Aplicaciones informáticas",                   accountNumOU: null, accountNameOU: "1120 Intangible assets: Software licences" },

  // ─── AMORT ────────────────────────────────────────────────────────────────────
  { tag: "AMORT:Equipos",       l1: "AMORT", description: "Amortización inmovilizado material — equipos",   accountNumSL: null, accountNameSL: "681 Amortización inmovilizado material",   accountNumOU: null, accountNameOU: "8000 Depreciation of tangible assets" },
  { tag: "AMORT:Oficina",       l1: "AMORT", description: "Amortización inmovilizado material — oficina",   accountNumSL: null, accountNameSL: "681 Amortización inmovilizado material",   accountNumOU: null, accountNameOU: "8010 Depreciation of office equipment" },
  { tag: "AMORT:SoftwarePropio",l1: "AMORT", description: "Amortización inmovilizado intangible",           accountNumSL: null, accountNameSL: "680 Amortización inmovilizado intangible", accountNumOU: null, accountNameOU: "8020 Amortisation of intangible assets" },
] as const;

async function main(): Promise<void> {
  console.log("Seeding account mappings…");
  for (const entry of ENTRIES) {
    await prisma.accountMapping.upsert({
      where: { tag: entry.tag },
      update: {
        description: entry.description,
        l1: entry.l1,
        accountNumSL: entry.accountNumSL ?? null,
        accountNameSL: entry.accountNameSL ?? null,
        accountNumOU: entry.accountNumOU ?? null,
        accountNameOU: entry.accountNameOU ?? null,
      },
      create: {
        tag: entry.tag,
        description: entry.description,
        l1: entry.l1,
        accountNumSL: entry.accountNumSL ?? null,
        accountNameSL: entry.accountNameSL ?? null,
        accountNumOU: entry.accountNumOU ?? null,
        accountNameOU: entry.accountNameOU ?? null,
      },
    });
  }
  console.log(`Done — ${ENTRIES.length} entries upserted.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
