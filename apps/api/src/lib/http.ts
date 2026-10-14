import type { ZodTypeAny, z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);
export const unauthorized = (msg = "Connexion requise", code = "unauthorized") => new HttpError(401, msg, code);
export const forbidden = (msg = "Vous n'avez pas le droit de faire cette action", code = "forbidden") => new HttpError(403, msg, code);
export const notFound = (msg = "Introuvable") => new HttpError(404, msg, "not_found");

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(first ? `${first.path.join(".") || "requête"} : ${first.message}` : "Requête invalide", "validation");
  }
  return r.data;
}

export const todayParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
