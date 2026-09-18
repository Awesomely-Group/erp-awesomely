-- AlterEnum
-- Estado de una sincronización que ha empezado pero aún no ha terminado. El SyncLog
-- pasa a crearse al EMPEZAR (RUNNING) y a cerrarse al acabar (SUCCESS/ERROR); antes
-- solo se escribía al final, así que un sync que moría por el límite de tiempo de la
-- función no dejaba ninguna fila y desaparecía sin rastro.
ALTER TYPE "SyncResult" ADD VALUE IF NOT EXISTS 'RUNNING';
