"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function InvoicesSplitLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode | null;
}): React.JSX.Element {
  const [panelWidth, setPanelWidth] = useState(460);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = panelWidth;
      e.preventDefault();
    },
    [panelWidth]
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setPanelWidth(Math.max(280, Math.min(720, startWidth.current + delta)));
    }
    function onMouseUp(): void {
      isDragging.current = false;
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (!panel) return <>{children}</>;

  return (
    <div className="flex items-start gap-0">
      <div className="flex-1 min-w-0 overflow-x-auto">{children}</div>

      <div
        className="w-2 flex-shrink-0 self-stretch mx-1 flex items-center justify-center cursor-col-resize group"
        onMouseDown={onMouseDown}
      >
        <div className="w-0.5 h-full rounded-full bg-gray-200 group-hover:bg-indigo-400 transition-colors" />
      </div>

      <div style={{ width: panelWidth }} className="flex-shrink-0 sticky top-4">
        {panel}
      </div>
    </div>
  );
}
