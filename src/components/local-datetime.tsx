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

export function LocalDateTime({ date, dateOnly = false }: Props): React.JSX.Element {
  const opts = dateOnly ? FORMAT_DATE : FORMAT_DATETIME;
  const [text, setText] = useState<string>(() =>
    new Intl.DateTimeFormat("es-ES", opts).format(new Date(date))
  );

  useEffect(() => {
    setText(new Intl.DateTimeFormat("es-ES", opts).format(new Date(date)));
  }, [date, dateOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span suppressHydrationWarning>{text}</span>;
}
