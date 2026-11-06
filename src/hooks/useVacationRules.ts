import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseDateSafely } from "@/lib/dateUtils";

export const RULE_KEYS = {
  advanceClt: "vacation_advance_days_clt",
  advancePj: "vacation_advance_days_pj",
  minGap: "vacation_min_gap_days",
} as const;

const DAY = 86400000;
const toDay = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const fmt = (n: number) => new Date(n * DAY).toLocaleDateString("pt-BR", { timeZone: "UTC" });

/** Advance notice violation: start must be at least `minDays` after today. */
export const advanceViolation = (start: Date, today: Date, minDays: number): string | null => {
  if (minDays <= 0) return null;
  const s = toDay(start), t = toDay(today);
  return s - t < minDays
    ? `Férias precisam ser pedidas com pelo menos ${minDays} dias de antecedência (início a partir de ${fmt(t + minDays)}).`
    : null;
};

/** Gap violation: another non-overlapping period closer than `gap` days. */
export const gapViolation = (
  start: Date, end: Date, others: { inicio: Date; fim: Date }[], gap: number,
): string | null => {
  if (gap <= 0) return null;
  const s = toDay(start), e = toDay(end);
  const hit = others.find((o) => {
    const os = toDay(o.inicio), oe = toDay(o.fim);
    const overlaps = os <= e && oe >= s;
    return !overlaps && oe >= s - gap && os <= e + gap;
  });
  return hit
    ? `É preciso um intervalo mínimo de ${gap} dias entre períodos de férias (conflito com ${fmt(toDay(hit.inicio))} a ${fmt(toDay(hit.fim))}).`
    : null;
};

export const useVacationRuleSettings = () => {
  const [s, setS] = useState({ advanceClt: 0, advancePj: 0, minGap: 0 });
  useEffect(() => {
    (supabase as any).from("system_settings").select("key, value")
      .in("key", Object.values(RULE_KEYS))
      .then(({ data }: any) => {
        const get = (k: string) => Number(data?.find((r: any) => r.key === k)?.value) || 0;
        setS({ advanceClt: get(RULE_KEYS.advanceClt), advancePj: get(RULE_KEYS.advancePj), minGap: get(RULE_KEYS.minGap) });
      });
  }, []);
  return s;
};

/** Returns rule violation messages for a vacation request (empty when OK). */
export const useVacationRuleViolations = (
  enabled: boolean, personId: string | null | undefined, inicio: string, fim: string, excludeId?: string,
) => {
  const settings = useVacationRuleSettings();
  const [violations, setViolations] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled || !personId || !inicio || !fim) { setViolations([]); return; }
    let cancelled = false;
    (async () => {
      const [{ data: p }, { data: reqs }] = await Promise.all([
        supabase.from("people").select("modelo_contrato").eq("id", personId).maybeSingle(),
        supabase.from("requests").select("id, inicio, fim").eq("requester_id", personId).eq("tipo", "FERIAS")
          .not("status", "in", "(CANCELADO,REPROVADO)"),
      ]);
      const isClt = (p?.modelo_contrato || "").startsWith("CLT");
      const start = parseDateSafely(inicio), end = parseDateSafely(fim);
      const others = (reqs || []).filter((r) => r.id !== excludeId && r.inicio && r.fim)
        .map((r) => ({ inicio: parseDateSafely(r.inicio!), fim: parseDateSafely(r.fim!) }));
      const v = [
        advanceViolation(start, new Date(), isClt ? settings.advanceClt : settings.advancePj),
        gapViolation(start, end, others, settings.minGap),
      ].filter(Boolean) as string[];
      if (!cancelled) setViolations(v);
    })();
    return () => { cancelled = true; };
  }, [enabled, personId, inicio, fim, excludeId, settings]);
  return violations;
};

/** Concessive period: balance acquired at last anniversary expires at the next one. */
export const vacationExpiry = (admissao: string | null | undefined, balance: number, today = new Date()) => {
  if (!admissao || balance <= 0) return null;
  const a = parseDateSafely(admissao);
  let next = new Date(today.getFullYear(), a.getMonth(), a.getDate());
  if (toDay(next) <= toDay(today)) next = new Date(today.getFullYear() + 1, a.getMonth(), a.getDate());
  if (next.getFullYear() - a.getFullYear() < 2) return null; // first concessive period not started yet
  const daysLeft = toDay(next) - toDay(today);
  const level = daysLeft < 60 ? "critical" : daysLeft <= 90 ? "warning" : null;
  return level ? { level, daysLeft, date: next } : null;
};
