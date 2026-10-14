"use client";

import { useActionState, useState } from "react";
import { grantAccess, revokeAccess, deleteApiKey, type GrantFormState, type ApiKeyFormState } from "./actions";

const FECHA = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

type GrantRow = {
  id: string;
  userLabel: string;
  userRole: "ADMIN" | "COMERCIAL";
  scopeLabels: string[];
  companyCount: number;
  marcaCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  note: string | null;
  grantedByName: string | null;
  liveKeys: number;
};

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  ownerLabel: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

type Option = { value: string; label: string; hint?: string };

export function ApiGrantsClient({
  grants,
  candidates,
  scopeOptions,
  companyOptions,
  marcaOptions,
  allKeys,
}: {
  grants: GrantRow[];
  candidates: { id: string; label: string; role: "ADMIN" | "COMERCIAL" }[];
  scopeOptions: Option[];
  companyOptions: { id: string; name: string }[];
  marcaOptions: { value: string; label: string }[];
  allKeys: KeyRow[];
}): React.JSX.Element {
  const [grantState, grantAction] = useActionState(grantAccess, undefined as GrantFormState);
  const [revokeState, revokeAction] = useActionState(revokeAccess, undefined as GrantFormState);
  const [keyState, keyAction] = useActionState(deleteApiKey, undefined as ApiKeyFormState);
  const [abierto, setAbierto] = useState(false);

  const vivas = grants.filter((g) => g.revokedAt === null);
  const retiradas = grants.filter((g) => g.revokedAt !== null);

  return (
    <div className="space-y-6">
      {vivas.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
          {vivas.map((g) => (
            <li key={g.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {g.userLabel}
                  {g.userRole === "COMERCIAL" ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Comercial
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{g.scopeLabels.join(" · ")}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {g.companyCount === 0 ? "Todas las sociedades" : `${g.companyCount} sociedad(es)`}
                  {" · "}
                  {g.marcaCount === 0 ? "Todas las marcas" : `${g.marcaCount} marca(s)`}
                  {` · Caduca ${FECHA.format(g.expiresAt)}`}
                  {` · ${g.liveKeys} clave(s) viva(s)`}
                  {g.grantedByName ? ` · Concedido por ${g.grantedByName}` : ""}
                </p>
                {g.note ? <p className="text-xs text-gray-400 mt-0.5 italic">{g.note}</p> : null}
              </div>
              <form action={revokeAction} className="shrink-0">
                <input type="hidden" name="grantId" value={g.id} />
                <button
                  type="submit"
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                  title={
                    g.liveKeys > 0
                      ? `Retirar el acceso revocará también ${g.liveKeys} clave(s)`
                      : "Retirar el acceso"
                  }
                >
                  Retirar{g.liveKeys > 0 ? ` (y ${g.liveKeys} clave${g.liveKeys === 1 ? "" : "s"})` : ""}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">Nadie tiene acceso por API concedido.</p>
      )}

      {revokeState?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {revokeState.error}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => setAbierto((previo) => !previo)}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {abierto ? "Cancelar" : "Conceder acceso a alguien"}
        </button>
      </div>

      {abierto ? (
        <form action={grantAction} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label htmlFor="grant-user" className="block text-sm font-medium text-gray-700 mb-1">
              Persona
            </label>
            <select
              id="grant-user"
              name="userId"
              required
              defaultValue=""
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="" disabled>
                Elige a quién…
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.role === "COMERCIAL" ? " (comercial)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Solo aparece quien puede entrar al ERP (allowlist de SSO). Quitar su email de la
              allowlist corta también sus claves.
            </p>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-1">Permisos</legend>
            <div className="space-y-2">
              {scopeOptions.map((scope) => (
                <label key={scope.value} className="flex gap-2 items-start">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope.value}
                    className="mt-1 accent-indigo-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-900">{scope.label}</span>
                    {scope.hint ? (
                      <span className="block text-xs text-gray-500">{scope.hint}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-1">Sociedades</legend>
              <p className="text-xs text-gray-500 mb-2">Sin marcar ninguna: todas.</p>
              <div className="space-y-1">
                {companyOptions.map((c) => (
                  <label key={c.id} className="flex gap-2 items-center">
                    <input
                      type="checkbox"
                      name="companyIds"
                      value={c.id}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm text-gray-900">{c.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-1">Marcas</legend>
              <p className="text-xs text-gray-500 mb-2">Sin marcar ninguna: todas.</p>
              <div className="space-y-1">
                {marcaOptions.map((m) => (
                  <label key={m.value} className="flex gap-2 items-center">
                    <input
                      type="checkbox"
                      name="marcas"
                      value={m.value}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm text-gray-900">{m.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="grant-days" className="block text-sm font-medium text-gray-700 mb-1">
                Caduca en (días)
              </label>
              <input
                id="grant-days"
                name="days"
                type="number"
                min={1}
                max={366}
                defaultValue={90}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="grant-note" className="block text-sm font-medium text-gray-700 mb-1">
                Para qué es
              </label>
              <input
                id="grant-note"
                name="note"
                type="text"
                maxLength={200}
                placeholder="Ej: MCP de Claude para informes de facturación"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Conceder
          </button>

          {grantState?.error ? (
            <p className="text-sm text-red-600" role="alert">
              {grantState.error}
            </p>
          ) : null}
        </form>
      ) : null}

      {retiradas.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500">
            {retiradas.length} autorización(es) retirada(s)
          </summary>
          <ul className="mt-2 space-y-1">
            {retiradas.map((g) => (
              <li key={g.id} className="text-xs text-gray-400">
                {g.userLabel} · retirada el {FECHA.format(g.revokedAt!)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Claves existentes</h3>
        <p className="text-xs text-gray-500">
          Puedes retirar cualquiera, pero no leer ninguna: el valor en claro no existe fuera del
          momento en que se creó.
        </p>
        {allKeys.length > 0 ? (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {allKeys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">
                    {k.name}
                    <span className="text-gray-400"> · {k.ownerLabel}</span>
                    {k.revokedAt ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Revocada
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{k.keyPrefix}••••••••</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {k.lastUsedAt ? `Último uso ${FECHA.format(k.lastUsedAt)}` : "Nunca usada"}
                    {k.revokedAt ? "" : ` · Caduca ${FECHA.format(k.expiresAt)}`}
                  </p>
                </div>
                {k.revokedAt ? null : (
                  <form action={keyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <button
                      type="submit"
                      className="text-sm font-medium text-red-600 hover:text-red-700 shrink-0"
                    >
                      Revocar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No hay ninguna clave creada.</p>
        )}
        {keyState?.error ? (
          <p className="text-sm text-red-600" role="alert">
            {keyState.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
