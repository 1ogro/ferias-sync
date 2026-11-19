import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateSafely } from "@/lib/dateUtils";

type Pulse = { week_start: string; kind: "checkin" | "checkout"; question: string; question_type: string; scale_value: number | null; text_value: string | null; submitted_at: string };
type Delivery = { week_start: string; kind: "checkin" | "checkout"; answered: boolean };
type Biscoito = { week_start: string; direction: "received" | "given"; other_name: string | null; category: string; message: string; created_at: string };
type Fb = { week_start: string; source: "peer" | "external"; author: string | null; question?: string; scale_value?: number | null; text_value: string | null; tone?: string; channel?: string; date: string };
type Data = { period_start: string; weeks: number; pulses: Pulse[]; deliveries: Delivery[]; biscoitos: Biscoito[]; feedbacks: Fb[] };

const CAT: Record<string, string> = { teamwork: "Trabalho em equipe", innovation: "Inovação", delivery: "Entrega", leadership: "Liderança", customer: "Cliente" };
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—");
const fmt = (d: string) => format(parseDateSafely(d.slice(0, 10)) ?? new Date(d), "dd/MM", { locale: ptBR });

export function PersonWeeklyWellbeing({ personId }: { personId: string }) {
  const [weeks, setWeeks] = useState("8");
  const { data, isLoading, error } = useQuery({
    queryKey: ["person-weekly-wellbeing", personId, weeks],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_person_weekly_wellbeing", { p_person_id: personId, p_weeks: Number(weeks) });
      if (error) throw error;
      return data as Data;
    },
  });

  const weekList = useMemo(() => {
    if (!data) return [];
    const start = parseDateSafely(data.period_start)!;
    return Array.from({ length: data.weeks }, (_, i) => format(addDays(start, i * 7), "yyyy-MM-dd")).reverse();
  }, [data]);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Carregando bem-estar...</p>;
  if (error || !data) return <p className="text-sm text-destructive p-4">Não foi possível carregar: {(error as any)?.message}</p>;

  const scale = (k: string) => data.pulses.filter((p) => p.kind === k && p.scale_value != null).map((p) => p.scale_value!);
  const answered = data.deliveries.filter((d) => d.answered).length;
  const kpis = [
    ["Média check-in", avg(scale("checkin"))],
    ["Média check-out", avg(scale("checkout"))],
    ["Biscoitos recebidos", data.biscoitos.filter((b) => b.direction === "received").length],
    ["Biscoitos enviados", data.biscoitos.filter((b) => b.direction === "given").length],
    ["Feedbacks", data.feedbacks.length],
    ["Adesão aos pulses", data.deliveries.length ? `${Math.round((answered / data.deliveries.length) * 100)}%` : "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={weeks} onValueChange={setWeeks}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["4", "8", "12"].map((w) => <SelectItem key={w} value={w}>Últimas {w} semanas</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {kpis.map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-semibold">{v}</p></CardContent></Card>
        ))}
      </div>
      {weekList.map((wk) => {
        const p = data.pulses.filter((x) => x.week_start === wk);
        const b = data.biscoitos.filter((x) => x.week_start === wk);
        const f = data.feedbacks.filter((x) => x.week_start === wk);
        const d = data.deliveries.filter((x) => x.week_start === wk);
        const end = format(addDays(parseDateSafely(wk)!, 6), "dd/MM");
        const empty = !p.length && !b.length && !f.length;
        return (
          <Card key={wk}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                Semana {fmt(wk)} – {end}
                {(["checkin", "checkout"] as const).map((k) => {
                  const s = p.filter((x) => x.kind === k && x.scale_value != null).map((x) => x.scale_value!);
                  const sent = d.some((x) => x.kind === k);
                  return <Badge key={k} variant={s.length ? "default" : "outline"}>{k === "checkin" ? "Check-in" : "Check-out"}: {s.length ? avg(s) : sent ? "sem resposta" : "—"}</Badge>;
                })}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {empty && <p className="text-muted-foreground">Nada registrado nesta semana.</p>}
              {(["checkin", "checkout"] as const).map((k) => {
                const items = p.filter((x) => x.kind === k);
                if (!items.length) return null;
                return (
                  <div key={k}>
                    <p className="font-medium">{k === "checkin" ? "Check-in" : "Check-out"} <span className="text-xs text-muted-foreground">({fmt(items[0].submitted_at)})</span></p>
                    <ul className="ml-4 list-disc">
                      {items.map((x, i) => <li key={i}><span className="text-muted-foreground">{x.question}:</span> {x.scale_value ?? x.text_value}</li>)}
                    </ul>
                  </div>
                );
              })}
              {b.length > 0 && (
                <div>
                  <p className="font-medium">🍪 Biscoitos</p>
                  <ul className="ml-4 list-disc">
                    {b.map((x, i) => <li key={i}>{x.direction === "received" ? `Recebeu de ${x.other_name ?? "—"}` : `Deu para ${x.other_name ?? "—"}`} · {CAT[x.category] ?? x.category}: “{x.message}”</li>)}
                  </ul>
                </div>
              )}
              {f.length > 0 && (
                <div>
                  <p className="font-medium">Feedbacks</p>
                  <ul className="ml-4 list-disc">
                    {f.map((x, i) => <li key={i}><Badge variant="secondary" className="mr-1">{x.source === "peer" ? "Par" : "Externo"}</Badge>{x.author ?? "Anônimo"}{x.question ? ` · ${x.question}` : ""}: {x.scale_value ?? x.text_value}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
