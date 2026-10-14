import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseBlPdf, detectPickup } from "./index.js";

const pdf = new Uint8Array(readFileSync(fileURLToPath(new URL("../fixtures/BL_02102026.pdf", import.meta.url))));

test("lit les 19 BL du PDF du 02/10/2026", async () => {
  const bls = await parseBlPdf(pdf);
  assert.equal(bls.length, 19);

  const first = bls[0]!;
  assert.equal(first.number, "00133511");
  assert.equal(first.client.code, "000215");
  assert.equal(first.client.name, "LA BAGUETTE MAGIQUE");
  assert.equal(first.client.postalCode, "33280");
  assert.equal(first.client.city, "MIOS");
  assert.deepEqual(first.client.phones, ["0540055828", "0606473686"]);
  assert.equal(first.windowStart, "06:00");
  assert.equal(first.windowEnd, "08:00");
  assert.equal(first.deliveryDate, "2026-10-02");
  assert.equal(first.orderNumber, "00162739");
  assert.equal(first.lines.length, 11);
  assert.equal(first.lines[0]!.designation, "PARTICIPATION AU FRAIS TRANSPORT EXCEPTIONNELLE");
  assert.equal(first.lines[1]!.ean, "3267180742831");
  assert.equal(first.lines[1]!.dlc, "2027-09-17");
  assert.equal(first.packageCount, 11);
  assert.equal(first.netWeightKg, 37.08);
  assert.equal(first.comment, "LIV 5H/6H30");

  const third = bls[2]!;
  assert.equal(third.client.name, "REYVEZ SARL - L ARRET MINUTE");
  assert.deepEqual(third.client.addressLines, ["CENTRE COMMERCIAL LECLERC", "1060 AVENUE DE L'EUROPE"]);
  assert.equal(third.client.phones.length, 3);
  const frais = third.lines.find((l) => l.category === "FRAIS")!;
  assert.equal(frais.quantity, 2);
  assert.equal(frais.unit, "KG");

  // Les deux gabarits (avec prix) sont lus pareil.
  const withPrices = bls.find((b) => b.number === "00133561")!;
  assert.equal(withPrices.lines.length, 4);
  assert.equal(withPrices.comment, "LIV A PARTIR DE 6H A 7H MAX PAS LIVRAISON APRES 7H IMPERATIF");
  assert.equal(withPrices.lines[1]!.designation, "CROISSANT PAC ARTI CARACTERE PRED70GX96");
  assert.equal(withPrices.lines[1]!.ean, "3267180735048");
  assert.equal(withPrices.lines[1]!.quantity, 2);
  assert.equal(withPrices.lines[1]!.lotNumber, "80316182");
  for (const bl of bls) {
    for (const l of bl.lines) assert.ok(l.unit && l.designation, `quantité BL ${bl.number} ${l.articleCode}`);
  }
});

test("détecte les reprises", () => {
  assert.ok(detectPickup("LIV AVANT 6H / APRES 8H REPRENDRE 1 COLIS DE CHOUQUETTES PROB. QUALITE"));
  assert.ok(!detectPickup("LIV 5H/6H30"));
});
