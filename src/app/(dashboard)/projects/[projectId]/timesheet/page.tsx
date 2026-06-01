import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProjectTimesheetSection } from "../project-timesheet-section";
import { assignIssueToBucket } from "../../actions";

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ bucketId?: string }>;
}

export default async function ProjectTimesheetPage({ params, searchParams }: Props): Promise<React.JSX.Element> {
  const { projectId } = await params;
  const { bucketId } = await searchParams;

  const project = await prisma.jiraProject.findUnique({
    where: { id: projectId },
    include: {
      workspace: true,
      hourBuckets: {
        where: { active: true },
        include: { role: true },
      },
      userRoles: true,
    },
  });

  if (!project) notFound();

  let filterAccountIds: string[] | undefined;
  let filterBucketName: string | undefined;
  if (bucketId) {
    const bucket = project.hourBuckets.find((b) => b.id === bucketId);
    if (bucket) {
      filterBucketName = bucket.role.name;
      filterAccountIds = project.userRoles
        .filter((ur) => ur.roleId === bucket.roleId)
        .map((ur) => ur.jiraAccountId);
    }
  }

  const buckets = project.hourBuckets.map((b) => ({ id: b.id, roleName: b.role.name, code: b.code ?? null, totalHours: b.totalHours }));

  const resolvedProjectId = project.id;

  async function handleAssignIssueToBucket(
    issueKey: string,
    jiraIssueId: number,
    hourBucketId: string | null
  ): Promise<void> {
    "use server";
    await assignIssueToBucket(resolvedProjectId, issueKey, jiraIssueId, hourBucketId);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/projects" className="hover:text-gray-700 transition-colors">Proyectos</Link>
        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <Link href={`/projects/${projectId}`} className="hover:text-gray-700 transition-colors">{project.name}</Link>
        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-700 font-medium">Timesheet</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Timesheet — {project.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          <span className="font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs mr-2">
            {project.jiraKey}
          </span>
          {project.workspace.name}
        </p>
      </div>

      {/* Timesheet */}
      <ProjectTimesheetSection
        projectId={project.id}
        hasTempoToken={!!project.workspace.tempoApiToken}
        workspaceDomain={project.workspace.domain}
        isBolsasHoras={project.isBolsasHoras}
        bucketByRole={Object.fromEntries(
          project.hourBuckets.map((b) => [
            b.roleId,
            { roleName: b.role.name, totalHours: b.totalHours },
          ])
        )}
        accountToRole={Object.fromEntries(project.userRoles.map((ur) => [ur.jiraAccountId, ur.roleId]))}
        filterAccountIds={filterAccountIds}
        filterBucketName={filterBucketName}
        buckets={buckets}
        onAssignIssueToBucket={handleAssignIssueToBucket}
      />
    </div>
  );
}
