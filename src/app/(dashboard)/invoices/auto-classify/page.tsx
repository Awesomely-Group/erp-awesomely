import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AutoClassifyTable } from "./auto-classify-table";
import { getBatchProposals } from "./actions";

export default async function AutoClassifyPage(): Promise<React.JSX.Element> {
  const [proposals, projects] = await Promise.all([
    getBatchProposals(),
    prisma.jiraProject.findMany({
      where: { active: true },
      include: { workspace: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-1">
            <Link
              href="/invoices"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Facturas
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Auto-clasificación</h1>
          <p className="text-sm text-gray-500 mt-1">
            {proposals.length} líneas sin clasificar en facturas de venta
          </p>
        </div>
      </div>

      <AutoClassifyTable
        proposals={proposals}
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          key: p.jiraKey,
          workspaceName: p.workspace.name,
        }))}
      />
    </div>
  );
}
