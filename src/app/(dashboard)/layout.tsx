import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const session = await auth();
  // En desarrollo local (NODE_ENV !== "production") se omite el login para agilizar las
  // pruebas sin pasar por SSO. Nunca afecta a producción (ver también src/proxy.ts).
  if (!session && process.env.NODE_ENV === "production") redirect("/login");

  return <DashboardShell>{children}</DashboardShell>;
}
