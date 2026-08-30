-- AlterTable
ALTER TABLE "jira_workspaces" ADD COLUMN     "giroOrgSlug" TEXT,
ADD COLUMN     "giroApiKey" TEXT;

-- AlterTable
ALTER TABLE "jira_projects" ADD COLUMN     "giroProjectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "jira_projects_giroProjectId_key" ON "jira_projects"("giroProjectId");
