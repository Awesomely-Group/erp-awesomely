"use client";

export default function InvoicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-4 p-8">
      <h1 className="text-xl font-bold text-red-700">Error en Facturas</h1>
      <pre className="text-sm bg-red-50 border border-red-200 rounded p-4 overflow-auto whitespace-pre-wrap">
        {error.message || "Sin mensaje"}
        {"\n\nDigest: "}
        {error.digest}
        {"\n\nStack:\n"}
        {error.stack}
      </pre>
      <button
        onClick={reset}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
      >
        Reintentar
      </button>
    </div>
  );
}
