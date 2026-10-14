/** Extrait les numéros français d'un texte libre du type "05.40.05.58.28/06 06 47 36 86 /". */
export function extractPhones(raw: string): string[] {
  const found = new Set<string>();
  const re = /(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/g;
  for (const m of raw.matchAll(re)) {
    let digits = m[0].replace(/\D/g, "");
    if (digits.startsWith("33")) digits = "0" + digits.slice(2);
    if (digits.length === 10) found.add(digits);
  }
  return [...found];
}

export function formatPhone(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
