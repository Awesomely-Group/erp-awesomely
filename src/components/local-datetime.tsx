"use client";

import { useSyncExternalStore } from "react";

interface Props {
  date: Date | string;
  dateOnly?: boolean;
}

const FORMAT_DATETIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const FORMAT_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

function noopSubscribe(): () => void {
  return () => {};
}

/** Renders date/time in the browser's local timezone (empty on server, then hydrates). */
export function LocalDateTime({ date, dateOnly = false }: Props): React.JSX.Element {
  const opts = dateOnly ? FORMAT_DATE : FORMAT_DATETIME;
  const text = useSyncExternalStore(
    noopSubscribe,
    () => new Intl.DateTimeFormat("es-ES", opts).format(new Date(date)),
    () => ""
  );

  return (
    <span suppressHydrationWarning title={text}>
      {text}
    </span>
  );
}
