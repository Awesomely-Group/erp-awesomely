import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProjectTimesheetSection } from "../project-timesheet-section";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectTimesheetPage({ params }: Props): Promise<React.JSX.Element> {
  const { projectId } = await params;

  const project = await prisma.jiraProject.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

  if (!project) notFound();

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
      />
    </div>
  );
}
