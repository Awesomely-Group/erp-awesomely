-- Bloque E: las horas que vienen de Giro no traen el id numérico de Jira.
--
-- La columna no la lee nadie (la llave de la asignación es `(projectId, issueKey)`);
-- existía solo porque la rama de Tempo lo tenía a mano. Rellenarla con un 0 desde Giro
-- sería guardar un id que no existe, así que se deja vacía.
ALTER TABLE "issue_hour_bucket_assignments" ALTER COLUMN "issueNumericId" DROP NOT NULL;
