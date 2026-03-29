"use client";

import { useEffect, useState } from "react";

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

// Renders date/time in the browser's local timezone.
// Starts empty to avoid SSR/hydration mismatch — fills in after mount.
export function LocalDateTime({ date, dateOnly = false }: Props): React.JSX.Element {
  const [text, setText] = useState("");

  useEffect(() => {
    const opts = dateOnly ? FORMAT_DATE : FORMAT_DATETIME;
    setText(new Intl.DateTimeFormat("es-ES", opts).format(new Date(date)));
  }, [date, dateOnly]);

  return <span>{text}</span>;
}
