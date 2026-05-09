"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import { ProjectStatus } from "@prisma/client";
import { updateProjectStatus } from "../actions";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  NOT_STARTED: "Sin iniciar",
  ONGOING: "En curso",
  PAUSED: "Pausado",
  DONE: "Completado",
  ARCHIVED: "Archivado",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  ONGOING: "bg-blue-100 text-blue-700",
  PAUSED: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
  ARCHIVED: "bg-red-100 text-red-600",
};

const ALL_STATUSES = Object.values(ProjectStatus) as ProjectStatus[];

interface StatusBadgeProps {
  projectId: string;
  status: ProjectStatus;
}

export function StatusBadge({ projectId, status }: StatusBadgeProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<ProjectStatus>(status);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOptimisticStatus(status);
  }, [status]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSelect(newStatus: ProjectStatus): void {
    setOpen(false);
    setOptimisticStatus(newStatus);
    startTransition(async () => {
      await updateProjectStatus(projectId, newStatus);
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity cursor-pointer ${STATUS_CLASSES[optimisticStatus]} ${isPending ? "opacity-60" : "hover:opacity-80"}`}
      >
        {STATUS_LABELS[optimisticStatus]}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${s === optimisticStatus ? "font-semibold" : ""}`}
            >
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${STATUS_CLASSES[s]}`}>
                {STATUS_LABELS[s]}
              </span>
              {s === optimisticStatus && (
                <svg className="w-3 h-3 text-indigo-600 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
