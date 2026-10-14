// Lecture des BL Maison Esclaire depuis le gros PDF quotidien.
// Chaque page porte l'en-tête complet du BL ; un BL sur plusieurs pages répète son numéro.
// Les colonnes du tableau sont repérées par leur position horizontale.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPhones, type ParsedBl, type ParsedBlLine } from "@me/shared";

interface Item { x: number; y: number; str: string }
interface Row { y: number; items: Item[] }

// Il existe deux gabarits (avec ou sans colonnes de prix) : les cellules d'une ligne
// sont donc reconnues par leur forme, de gauche à droite, plutôt que par leur position.
const ARTICLE_MAX_X = 60;
const CLIENT_X = 300;
const RE_EAN = /^\d{13}$/;
const RE_QTY = /^(\d+(?:[.,]\d+)?)\s*([A-Za-z]+)$/;
const RE_WEIGHT = /^(\d+(?:[.,]\d+)?)\s*KG$/i;
const RE_PRICE = /^\d+,\d{2}$/;
const RE_DATE = /^\d{2}\/\d{2}\/\d{2,4}$/;

function parseLineRow(items: Item[], category: string): ParsedBlLine {
  const cells = items.map((i) => i.str.trim()).filter(Boolean);
  const articleCode = cells.shift()!;
  const designation: string[] = [];
  let ean: string | null = null;
  let qty: RegExpMatchArray | null = null;
  let weight: number | null = null;
  const lot: string[] = [];
  let dlc: string | null = null;
  for (const c of cells) {
    if (!qty) {
      if (!ean && RE_EAN.test(c)) ean = c;
      else if (RE_QTY.test(c) && designation.length) qty = c.match(RE_QTY);
      else designation.push(c);
    } else if (weight === null && RE_WEIGHT.test(c)) {
      weight = num(c.replace(/kg/i, ""));
    } else if (RE_DATE.test(c)) {
      dlc = isoDate(c);
    } else if (!RE_PRICE.test(c)) {
      lot.push(c);
    }
  }
  return {
    category: category || "SANS CATÉGORIE",
    articleCode,
    designation: designation.join(" "),
    ean,
    quantity: qty ? (num(qty[1]!) ?? 0) : 0,
    unit: qty ? qty[2]!.toUpperCase() : "",
    weightKg: weight,
    lotNumber: lot.join(" ") || null,
    dlc,
  };
}

function rowsOf(items: Item[]): Row[] {
  const rows: Row[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

const text = (r: Row, from = -Infinity, to = Infinity) =>
  r.items.filter((i) => i.x >= from && i.x < to).map((i) => i.str.trim()).filter(Boolean).join(" ");

const num = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const isoDate = (d: string) => {
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
};

interface PageData {
  page: number;
  number: string;
  header: Omit<ParsedBl, "lines" | "packageCount" | "netWeightKg" | "comment" | "number" | "pageStart">;
  lines: ParsedBlLine[];
  packageCount: number | null;
  netWeightKg: number | null;
  comment: string | null;
  lastCategory: string;
}

function parsePage(rows: Row[], page: number, carriedCategory: string): PageData | null {
  const all = rows.map((r) => text(r));
  const numberRow = all.find((t) => /Bon de livraison N°/i.test(t));
  const number = numberRow?.match(/N°\s*(\d+)/)?.[1];
  if (!number) return null;

  const find = (re: RegExp) => {
    for (const t of all) {
      const m = t.match(re);
      if (m) return m;
    }
    return null;
  };

  // Bloc client : à droite, entre « Adresse de livraison » et le numéro de BL.
  const addrIdx = rows.findIndex((r) => /Adresse de livraison/i.test(text(r)));
  const numIdx = rows.findIndex((r) => /Bon de livraison N°/i.test(text(r)));
  const clientLines: string[] = [];
  for (let i = addrIdx + 1; i < numIdx && i >= 1; i++) {
    const t = text(rows[i]!, CLIENT_X);
    if (t) clientLines.push(t);
  }
  const phoneLine = clientLines.find((l) => /^T[ée]l\s*:/i.test(l)) ?? "";
  const body = clientLines.filter((l) => l !== phoneLine);
  const nameLine = body.shift() ?? "";
  const codeMatch = nameLine.match(/^(.*?)\s*-\s*(\d{4,})\s*$/);
  const cpIdx = body.findIndex((l) => /^\d{5}\s/.test(l));
  const cpLine = cpIdx >= 0 ? body[cpIdx]! : null;
  const addressLines = body.filter((_, i) => i !== cpIdx);

  const dep = find(/Départ le\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*à\s*(\d{2}:\d{2})/);
  const liv = find(/Livraison le\s*:\s*(\d{2}\/\d{2}\/\d{4})/);
  const carrier = find(/Transporteur\s*:\s*(.+)$/);
  const window = find(/Heure de livraison\s*:\s*de\s*(\d{2}:\d{2})\s*à\s*(?:de\s*)?(\d{2}:\d{2})/);
  const order = find(/Commande n°\s*(\d+)\s*du\s*(\d{2}\/\d{2}\/\d{4})/);

  // Tableau : entre l'en-tête de colonnes et « Nombre de colis ».
  const headIdx = rows.findIndex((r) => /Désignation/.test(text(r)) && /EAN/.test(text(r)));
  const totalIdx = rows.findIndex((r) => /Nombre de colis/i.test(text(r)));
  const end = totalIdx >= 0 ? totalIdx : rows.length;
  const lines: ParsedBlLine[] = [];
  let category = carriedCategory;
  for (let i = headIdx + 1; i < end && headIdx >= 0; i++) {
    const r = rows[i]!;
    const full = text(r);
    if (!full || /Votre Commande/i.test(full) || /^Page\s*:/i.test(full)) continue;
    const first = r.items[0]!;
    if (/^\d{3,}$/.test(first.str.trim()) && first.x < ARTICLE_MAX_X) {
      lines.push(parseLineRow(r.items, category));
    } else if (r.items.length === 1 && first.x < ARTICLE_MAX_X && /^[A-ZÉÈÀ' &-]+$/.test(full)) {
      // Titre de famille (SURGELE, FRAIS, SEC, GOURMET…), aligné à gauche.
      category = full;
    } else if (lines.length && first.x >= ARTICLE_MAX_X) {
      // Suite de désignation sur la ligne suivante (ex. « EXCEPTIONNELLE »).
      lines[lines.length - 1]!.designation += ` ${full}`;
    }
  }

  let packageCount: number | null = null;
  let netWeightKg: number | null = null;
  let comment: string | null = null;
  if (totalIdx >= 0) {
    const t = text(rows[totalIdx]!);
    packageCount = num(t.match(/Nombre de colis\s*:\s*([\d\s]+)/)?.[1] ?? "");
    netWeightKg = num(t.match(/Poids Net\s*:\s*([\d.,\s]+)/)?.[1] ?? "");
    const after: string[] = [];
    for (const r of rows.slice(totalIdx + 1)) {
      const t = text(r);
      // Le gabarit avec prix ajoute un pied de page TVA : on s'arrête avant.
      if (/^Taux TVA/i.test(t)) break;
      if (t) after.push(t);
    }
    comment = after.join("\n").trim() || null;
  }

  return {
    page,
    number,
    header: {
      orderNumber: order?.[1] ?? null,
      orderDate: order ? isoDate(order[2]!) : null,
      departureAt: dep ? `${isoDate(dep[1]!)}T${dep[2]}:00` : null,
      deliveryDate: liv ? isoDate(liv[1]!) : null,
      carrier: carrier?.[1]?.trim() ?? null,
      windowStart: window?.[1] ?? null,
      windowEnd: window?.[2] ?? null,
      client: {
        code: codeMatch?.[2] ?? null,
        name: (codeMatch?.[1] ?? nameLine).trim(),
        addressLines,
        postalCode: cpLine?.slice(0, 5) ?? null,
        city: cpLine?.slice(5).trim() ?? null,
        phones: extractPhones(phoneLine),
      },
    },
    lines,
    packageCount,
    netWeightKg,
    comment,
    lastCategory: category,
  };
}

export async function parseBlPdf(data: Uint8Array): Promise<ParsedBl[]> {
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const result: ParsedBl[] = [];
  let carried = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items) {
      if ("str" in it && it.str.trim()) items.push({ x: it.transform[4], y: it.transform[5], str: it.str });
    }
    const prev = result[result.length - 1];
    const pd = parsePage(rowsOf(items), p, carried);
    if (!pd) continue;
    if (prev && prev.number === pd.number) {
      // Page suivante du même BL.
      prev.lines.push(...pd.lines);
      prev.packageCount = pd.packageCount ?? prev.packageCount;
      prev.netWeightKg = pd.netWeightKg ?? prev.netWeightKg;
      prev.comment = pd.comment ?? prev.comment;
    } else {
      result.push({ number: pd.number, pageStart: p, ...pd.header, lines: pd.lines, packageCount: pd.packageCount, netWeightKg: pd.netWeightKg, comment: pd.comment });
    }
    carried = pd.packageCount === null ? pd.lastCategory : "";
  }
  await doc.cleanup();
  return result;
}

/** Une reprise est demandée quand le commentaire parle de reprendre ou récupérer quelque chose. */
export function detectPickup(comment: string | null): boolean {
  return !!comment && /\b(REPRENDRE|REPRISE|RECUP[EÉ]RER|RAMENER|RETOUR)\b/i.test(comment);
}
