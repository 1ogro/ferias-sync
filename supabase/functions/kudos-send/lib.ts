// Pure helpers for kudos-send. Unit-tested in dedup_test.ts.

export const DEDUP_WINDOW_SECONDS = 60;

export interface KudoLike {
  id: string;
  from_person_id: string | null;
  to_person_id: string | null;
  message: string;
  category: string;
  created_at: string; // ISO
}

/** Normalize message for dedup comparison (trim + collapse internal whitespace). */
export function normalizeMessage(msg: string): string {
  return (msg ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Given a candidate kudo and a list of recent kudos (already fetched from DB
 * scoped to the same sender), return the first one that matches — meaning the
 * candidate is a duplicate that should be suppressed.
 */
export function findRecentDuplicate(
  candidate: { from_person_id: string; to_person_id: string; message: string; category: string },
  recent: KudoLike[],
  nowMs: number = Date.now(),
  windowSeconds: number = DEDUP_WINDOW_SECONDS,
): KudoLike | null {
  const normCandidate = normalizeMessage(candidate.message);
  const cutoff = nowMs - windowSeconds * 1000;
  for (const k of recent) {
    if (k.from_person_id !== candidate.from_person_id) continue;
    if (k.to_person_id !== candidate.to_person_id) continue;
    if (k.category !== candidate.category) continue;
    if (normalizeMessage(k.message) !== normCandidate) continue;
    const ts = Date.parse(k.created_at);
    if (Number.isNaN(ts)) continue;
    if (ts < cutoff) continue;
    return k;
  }
  return null;
}
