"use server";

import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  await prisma.jiraProject.update({ where: { id: projectId }, data: { status } });
  revalidatePath("/projects");
}
