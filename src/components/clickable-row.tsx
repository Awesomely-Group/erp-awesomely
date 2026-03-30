"use client";

import { useRouter } from "next/navigation";

interface Props {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function ClickableRow({ href, className, children }: Props): React.JSX.Element {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        router.push(href);
      }}
      className={`cursor-pointer ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}
