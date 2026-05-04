/**
 * Reclassifies all non-approved SALE invoice lines using the current suggestion algorithm.
 * Skips lines with APPROVED or REVIEWED classifications.
 *
 * Usage: npx tsx --env-file=.env scripts/reclassify-all.ts
 */

import { PrismaClient, ClassificationStatus, InvoiceType, AuditAction } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { getSuggestionsForLine } from "../src/lib/suggestions";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function updateInvoiceStatus(invoiceId: string): Promise<void> {
  const lines = await prisma.invoiceLine.findMany({
    where: { invoiceId },
    include: { classification: true },
  });

  const total = lines.length;
  const classified = lines.filter((l) => l.classification !== null).length;
  const allApproved =
    classified === total &&
    lines.every((l) => l.classification?.status === ClassificationStatus.APPROVED);
  const allClassifiedOrBetter =
    classified === total &&
    lines.every(
      (l) =>
        l.classification?.status === ClassificationStatus.CLASSIFIED ||
        l.classification?.status === ClassificationStatus.APPROVED
    );

  const status =
    classified === 0
      ? "PENDING"
      : classified < total
        ? "PARTIAL"
        : allApproved
          ? "APPROVED"
          : allClassifiedOrBetter
            ? "CLASSIFIED"
            : "PARTIAL";

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: status as never } });
}

async function deriveMarcaFromLines(invoiceId: string): Promise<void> {
  const classifications = await prisma.classification.findMany({
    where: { invoiceLine: { invoiceId } },
    include: { project: { include: { workspace: true } } },
  });

  const marcas = [
    ...new Set([
      ...classifications.filter((c) => c.project).map((c) => c.project!.workspace.name),
      ...classifications.filter((c) => !c.project).map(() => "Awesomely"),
    ]),
  ].sort();

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { marca: marcas.length > 0 ? marcas.join(",") : null },
  });
}

async function main(): Promise<void> {
  console.log("Fetching SALE invoice lines to reclassify…");

  const lines = await prisma.invoiceLine.findMany({
    where: {
      invoice: { type: InvoiceType.SALE },
      OR: [
        { classification: null },
        { classification: { status: ClassificationStatus.CLASSIFIED } },
      ],
    },
    include: {
      invoice: { select: { id: true, number: true, counterparty: true } },
      classification: { select: { id: true, status: true } },
    },
    orderBy: [{ invoice: { date: "desc" } }, { sortOrder: "asc" }],
  });

  console.log(`Found ${lines.length} lines to process.`);

  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const line of lines) {
    try {
      const suggestions = await getSuggestionsForLine({
        counterparty: line.invoice.counterparty,
        lineName: line.name,
        lineDescription: line.description,
      });

      const top = suggestions[0] ?? null;
      if (!top) {
        skipped++;
        continue;
      }

      const data = {
        projectId: top.projectId,
        notes: null as string | null,
        classifiedBy: "auto-reclassify",
        classifiedAt: new Date(),
        status: ClassificationStatus.CLASSIFIED,
      };

      if (line.classification) {
        await prisma.classification.update({
          where: { invoiceLineId: line.id },
          data,
        });
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: AuditAction.UPDATE,
            entityType: "Classification",
            entityId: line.classification.id,
            previousValue: { projectId: null, auto: true },
            newValue: { projectId: top.projectId, confidence: top.confidence },
            invoiceId: line.invoice.id,
            classificationId: line.classification.id,
          },
        });
      } else {
        const created = await prisma.classification.create({
          data: { invoiceLineId: line.id, ...data },
        });
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: AuditAction.CLASSIFY,
            entityType: "Classification",
            entityId: created.id,
            newValue: { projectId: top.projectId, confidence: top.confidence },
            invoiceId: line.invoice.id,
            classificationId: created.id,
          },
        });
      }

      await updateInvoiceStatus(line.invoice.id);
      await deriveMarcaFromLines(line.invoice.id);

      applied++;
      if (applied % 10 === 0) {
        process.stdout.write(`\r${applied} aplicadas, ${skipped} sin sugerencia…`);
      }
    } catch (err) {
      errors++;
      console.error(`\nError en línea ${line.id}:`, err);
    }
  }

  console.log(`\n\nListo: ${applied} clasificadas, ${skipped} sin sugerencia, ${errors} errores.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
