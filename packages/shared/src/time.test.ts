import { test } from "node:test";
import assert from "node:assert/strict";
import { roundPunch } from "./time.js";

const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 2, h, m));
const hm = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

test("arrondi au plus proche", () => {
  assert.equal(hm(roundPunch(at(7, 7), "start", 0, "nearest").rounded), "7:00");
  assert.equal(hm(roundPunch(at(7, 8), "start", 0, "nearest").rounded), "7:15");
});

test("compensation : 3 jours à 7h05", () => {
  let offset = 0;
  const out: string[] = [];
  for (let day = 0; day < 3; day++) {
    const r = roundPunch(at(7, 5), "start", offset, "compensated");
    offset = r.offsetAfter;
    out.push(hm(r.rounded));
  }
  assert.deepEqual(out, ["7:00", "7:00", "7:15"]);
  assert.equal(offset, 0);
});

test("compensation sur la fin de poste", () => {
  let offset = 0;
  const out: string[] = [];
  for (let day = 0; day < 3; day++) {
    const r = roundPunch(at(14, 55), "end", offset, "compensated");
    offset = r.offsetAfter;
    out.push(hm(r.rounded));
  }
  // 14h55 -> 15h00 (+5), +5, puis 14h45 pour revenir à 0.
  assert.deepEqual(out, ["15:00", "15:00", "14:45"]);
  assert.equal(offset, 0);
});
