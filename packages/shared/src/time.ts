// Arrondi des heures au quart d'heure, avec compteur de compensation continu.
//
// Le compteur cumule l'écart (arrondi - réel) en minutes, du point de vue du temps payé :
// une prise de poste arrondie plus tôt ou une fin arrondie plus tard ajoute des minutes
// au salarié (écart positif). Quand l'arrondi au plus proche ferait atteindre un quart
// d'heure d'écart cumulé, on arrondit dans l'autre sens pour compenser.

export type RoundingMode = "none" | "nearest" | "compensated";

export interface RoundResult {
  rounded: Date;
  /** Minutes gagnées (+) ou perdues (-) par le salarié sur ce pointage. */
  delta: number;
  offsetAfter: number;
}

const MINUTE = 60_000;

function candidates(t: Date, step: number): [Date, Date] {
  const ms = step * MINUTE;
  const floor = new Date(Math.floor(t.getTime() / ms) * ms);
  const ceil = floor.getTime() === t.getTime() ? floor : new Date(floor.getTime() + ms);
  return [floor, ceil];
}

/**
 * kind = "start" : arrondir plus tôt rapporte des minutes au salarié.
 * kind = "end"   : arrondir plus tard rapporte des minutes au salarié.
 */
export function roundPunch(
  t: Date,
  kind: "start" | "end",
  offsetBefore: number,
  mode: RoundingMode,
  step = 15,
): RoundResult {
  if (mode === "none") return { rounded: t, delta: 0, offsetAfter: offsetBefore };
  const [floor, ceil] = candidates(t, step);
  const gain = (r: Date) => {
    const diff = Math.round((r.getTime() - t.getTime()) / MINUTE);
    return kind === "start" ? -diff : diff;
  };
  const dFloor = Math.abs(t.getTime() - floor.getTime());
  const dCeil = Math.abs(ceil.getTime() - t.getTime());
  // Au plus proche ; à égalité on prend le quart supérieur (7h07 -> 7h00, 7h08 -> 7h15).
  let pick = dFloor < dCeil ? floor : ceil;
  if (mode === "compensated") {
    const other = pick === floor ? ceil : floor;
    if (Math.abs(offsetBefore + gain(pick)) >= step && Math.abs(offsetBefore + gain(other)) < Math.abs(offsetBefore + gain(pick))) {
      pick = other;
    }
  }
  const delta = gain(pick);
  return { rounded: pick, delta, offsetAfter: offsetBefore + delta };
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MINUTE);
}
