export interface CapacityAbsence {
  personId: string;
  nome: string;
  tipo: string;
  inicio: string; // YYYY-MM-DD
  fim: string;
  pending: boolean;
}

export interface CapacityWindow {
  start: string;
  end: string;
  peak: number;
  minCapacityPct: number;
  overlap: boolean;
  lowCapacity: boolean;
  hasPending: boolean;
  people: CapacityAbsence[];
}

const addDays = (d: string, n: number) => {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, dd + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

/** Varre dia a dia e agrupa períodos em que o time ultrapassa o limite de ausências ou cai abaixo da capacidade mínima. */
export function computeCapacityWindows(
  absences: CapacityAbsence[],
  headcount: number,
  from: string,
  to: string,
  overlapThreshold: number,
  minCapacityPct: number,
): CapacityWindow[] {
  const windows: CapacityWindow[] = [];
  let cur: CapacityWindow | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const today = absences.filter((a) => a.inicio <= d && a.fim >= d);
    const people = new Set(today.map((a) => a.personId));
    const absent = people.size;
    const pct = headcount > 0 ? Math.round(((headcount - absent) / headcount) * 100) : 100;
    const overlap = absent >= overlapThreshold && absent >= 2;
    const low = absent > 0 && pct < minCapacityPct;
    if (overlap || low) {
      if (!cur) {
        cur = { start: d, end: d, peak: 0, minCapacityPct: 100, overlap: false, lowCapacity: false, hasPending: false, people: [] };
        windows.push(cur);
      }
      cur.end = d;
      cur.peak = Math.max(cur.peak, absent);
      cur.minCapacityPct = Math.min(cur.minCapacityPct, pct);
      cur.overlap ||= overlap;
      cur.lowCapacity ||= low;
      for (const a of today) {
        if (!cur.people.some((p) => p.personId === a.personId && p.inicio === a.inicio && p.tipo === a.tipo)) cur.people.push(a);
      }
      cur.hasPending = cur.people.some((p) => p.pending);
    } else {
      cur = null;
    }
  }
  return windows;
}
