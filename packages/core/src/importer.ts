import { createHash } from "node:crypto";
import { parseBlPdf, detectPickup } from "@me/bl-parser";
import { eq, inArray, type Db, imports, files, clients, deliveryNotes, deliveryLines } from "@me/db";
import { autoPlan } from "./planning.js";

export interface ImportResult {
  blCount: number;
  skipped: number;
  newClients: number;
  dates: string[];
}

/** Traite un import : lit le PDF, crée clients, BL et lignes, puis répartit par secteur. */
export async function processImport(db: Db, importId: string): Promise<ImportResult> {
  const [imp] = await db.select().from(imports).where(eq(imports.id, importId));
  if (!imp) throw new Error(`Import ${importId} introuvable`);
  if (!imp.fileId) throw new Error("Fichier PDF manquant");
  await db.update(imports).set({ status: "processing" }).where(eq(imports.id, importId));

  try {
    const [file] = await db.select().from(files).where(eq(files.id, imp.fileId));
    if (!file) throw new Error("Fichier PDF introuvable");
    const bls = await parseBlPdf(new Uint8Array(file.data));
    if (bls.length === 0) throw new Error("Aucun BL reconnu dans ce PDF");

    const existing = await db
      .select({ number: deliveryNotes.number })
      .from(deliveryNotes)
      .where(inArray(deliveryNotes.number, bls.map((b) => b.number)));
    const already = new Set(existing.map((e) => e.number));

    let newClients = 0;
    let created = 0;
    const dates = new Set<string>();
    for (const bl of bls) {
      if (already.has(bl.number)) continue;
      const code = bl.client.code ?? `X${createHash("sha1").update(bl.client.name).digest("hex").slice(0, 8)}`;
      const [found] = await db.select().from(clients).where(eq(clients.code, code));
      let clientId: string;
      if (found) {
        clientId = found.id;
        // Le PDF fait foi pour l'adresse et les téléphones ; secteur, mail et notes restent gérés dans le panel.
        await db
          .update(clients)
          .set({
            name: bl.client.name,
            addressLines: bl.client.addressLines,
            postalCode: bl.client.postalCode,
            city: bl.client.city,
            phones: bl.client.phones.length ? bl.client.phones : found.phones,
            updatedAt: new Date(),
          })
          .where(eq(clients.id, found.id));
      } else {
        const [c] = await db
          .insert(clients)
          .values({
            code,
            name: bl.client.name,
            addressLines: bl.client.addressLines,
            postalCode: bl.client.postalCode,
            city: bl.client.city,
            phones: bl.client.phones,
          })
          .returning();
        clientId = c!.id;
        newClients++;
      }

      const deliveryDate = bl.deliveryDate ?? new Date().toISOString().slice(0, 10);
      dates.add(deliveryDate);
      const [dn] = await db
        .insert(deliveryNotes)
        .values({
          depotId: imp.depotId,
          importId,
          number: bl.number,
          orderNumber: bl.orderNumber,
          orderDate: bl.orderDate,
          departureAt: bl.departureAt ? new Date(bl.departureAt) : null,
          deliveryDate,
          carrier: bl.carrier,
          windowStart: bl.windowStart,
          windowEnd: bl.windowEnd,
          clientId,
          clientSnapshot: {
            name: bl.client.name,
            addressLines: bl.client.addressLines,
            postalCode: bl.client.postalCode,
            city: bl.client.city,
            phones: bl.client.phones,
          },
          packageCount: bl.packageCount,
          netWeightKg: bl.netWeightKg?.toString() ?? null,
          comment: bl.comment,
          pickupRequested: detectPickup(bl.comment),
          sourcePage: bl.pageStart,
        })
        .returning();
      if (bl.lines.length) {
        await db.insert(deliveryLines).values(
          bl.lines.map((l, i) => ({
            deliveryNoteId: dn!.id,
            position: i + 1,
            category: l.category,
            articleCode: l.articleCode,
            designation: l.designation,
            ean: l.ean,
            quantity: l.quantity.toString(),
            unit: l.unit,
            weightKg: l.weightKg?.toString() ?? null,
            lotNumber: l.lotNumber,
            dlc: l.dlc,
          })),
        );
      }
      created++;
    }

    for (const d of dates) await autoPlan(db, imp.depotId, d);

    const result = { blCount: created, skipped: bls.length - created, newClients, dates: [...dates] };
    await db
      .update(imports)
      .set({ status: "done", blCount: created, skipped: result.skipped, newClients, finishedAt: new Date(), error: null })
      .where(eq(imports.id, importId));
    return result;
  } catch (err) {
    await db
      .update(imports)
      .set({ status: "failed", error: (err as Error).message, finishedAt: new Date() })
      .where(eq(imports.id, importId));
    throw err;
  }
}
