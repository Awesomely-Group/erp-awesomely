import { prisma } from "@/lib/prisma";
import { PayrollView, type PayrollRecord } from "./payroll-view";

/**
 * RRHH → Nóminas — nóminas sincronizadas desde el módulo Team de Holded
 * (`syncEmployeesAndSalaryRecords`, ver src/lib/sync.ts). E15, 2026-09-15.
 * Los borradores (isDraft) no están confirmados en Holded, se excluyen — mismo
 * criterio que en payments/page.tsx.
 */
export default async function PayrollPage(): Promise<React.JSX.Element> {
  const records = await prisma.salaryRecord.findMany({
    where: { isDraft: false },
    include: {
      lines: true,
      company: { select: { name: true } },
      employee: { select: { iban: true } },
    },
    orderBy: { date: "desc" },
  });

  const payload: PayrollRecord[] = records.map((r) => ({
    id: r.id,
    holdedSalaryRecordId: r.holdedSalaryRecordId,
    employeeName: r.employeeName,
    employeeIban: r.employee?.iban ?? null,
    description: r.description,
    date: r.date.toISOString(),
    totalPayable: Number(r.totalPayable),
    paymentTotal: Number(r.paymentTotal),
    paymentPending: Number(r.paymentPending),
    paymentStatus: r.paymentStatus,
    companyName: r.company.name,
    lines: r.lines.map((l) => ({
      type: l.type,
      amount: Number(l.amount),
      description: l.description,
    })),
  }));

  return <PayrollView records={payload} />;
}
