import type { FastifyRequest } from "fastify";
import { auditLogs } from "@me/db";
import { db } from "../context.js";

/** Trace une action : qui, quoi, quand, avec la valeur avant et après. */
export async function audit(
  req: FastifyRequest,
  action: string,
  entity: string,
  entityId: string | null,
  opts: { depotId?: string | null; before?: unknown; after?: unknown } = {},
) {
  await db.insert(auditLogs).values({
    userId: req.auth?.userId ?? null,
    action,
    entity,
    entityId,
    depotId: opts.depotId ?? null,
    before: (opts.before ?? null) as object | null,
    after: (opts.after ?? null) as object | null,
    ip: req.ip,
  });
}

/** Retire les champs secrets avant de les écrire dans le journal. */
export function redact<T extends Record<string, unknown>>(row: T | undefined | null) {
  if (!row) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const k of ["passwordHash", "driverPinHash", "panelPinHash", "totpSecret", "data"]) {
    if (k in copy) copy[k] = copy[k] ? "***" : null;
  }
  return copy;
}
