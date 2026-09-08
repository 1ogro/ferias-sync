import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, HeartPulse, TrendingDown, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWellbeingTeamWeekly, WellbeingKind, WellbeingRow } from "@/hooks/useWellbeing";

const COLORS = [
  "hsl(var(--primary))",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function weekLabel(iso: string) {
  try {
    return format(parseISO(iso), "dd/MM", { locale: ptBR });
  } catch {
    return iso;
  }
}

function fmt(v: number | null | undefined, digits = 2) {
  return v == null ? "—" : v.toFixed(digits);
}

function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null) return null;
  const d = current - previous;
  if (Math.abs(d) < 0.005) return <span className="text-xs text-muted-foreground">estável</span>;
  const up = d > 0;
  return (
    <span className={`text-xs inline-flex items-center gap-1 ${up ? "text-emerald-600" : "text-destructive"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{d.toFixed(2)}
    </span>
  );
}

export function WellbeingTeamPanel() {
  const [weeks, setWeeks] = useState(12);
  const [team, setTeam] = useState<string>("all");
  const [kind, setKind] = useState<"both" | WellbeingKind>("both");

  const { data: rows = [], isLoading, isError, error, refetch, isFetching } = useWellbeingTeamWeekly({
    weeks,
    subTime: team === "all" ? null : team,
  });

  const teams = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sub_time))).sort(),
    [rows]
  );

  const kinds: WellbeingKind[] = kind === "both" ? ["checkin", "checkout"] : [kind];
  const filtered = useMemo(() => rows.filter((r) => kinds.includes(r.kind)), [rows, kind]);

  const weekList = useMemo(
    () => Array.from(new Set(filtered.map((r) => r.week_start))).sort(),
    [filtered]
  );
  const lastWeek = weekList[weekList.length - 1];
  const prevWeek = weekList[weekList.length - 2];

  const summaryFor = (week: string | undefined, k: WellbeingKind) => {
    const rs = filtered.filter((r) => r.week_start === week && r.kind === k);
    const withAvg = rs.filter((r) => r.avg_value != null);
    const responses = rs.reduce((a, r) => a + r.response_count, 0);
    const respondents = rs.reduce((a, r) => a + r.respondent_count, 0);
    const recipients = rs.reduce((a, r) => a + r.recipients_count, 0);
    const weightedTotal = withAvg.reduce((a, r) => a + (r.avg_value as number) * r.response_count, 0);
    const weightedCount = withAvg.reduce((a, r) => a + r.response_count, 0);
    return {
      avg: weightedCount ? weightedTotal / weightedCount : null,
      responses,
      respondents,
      recipients,
      rate: recipients ? (respondents / recipients) * 100 : null,
    };
  };

  const curIn = summaryFor(lastWeek, "checkin");
  const prevIn = summaryFor(prevWeek, "checkin");
  const curOut = summaryFor(lastWeek, "checkout");
  const prevOut = summaryFor(prevWeek, "checkout");

  // Table: one row per team for the latest week
  const tableRows = useMemo(() => {
    const map = new Map<string, { team: string; in?: WellbeingRow; out?: WellbeingRow }>();
    filtered
      .filter((r) => r.week_start === lastWeek)
      .forEach((r) => {
        const e = map.get(r.sub_time) || { team: r.sub_time };
        if (r.kind === "checkin") e.in = r; else e.out = r;
        map.set(r.sub_time, e);
      });
    return Array.from(map.values()).sort((a, b) => a.team.localeCompare(b.team));
  }, [filtered, lastWeek]);

  // Chart: one line per team (average across selected kinds)
  const chartData = useMemo(() => {
    return weekList.map((wk) => {
      const point: Record<string, any> = { week: weekLabel(wk) };
      teams.forEach((t) => {
        const rs = filtered.filter((r) => r.week_start === wk && r.sub_time === t && r.avg_value != null);
        const total = rs.reduce((a, r) => a + (r.avg_value as number) * r.response_count, 0);
        const count = rs.reduce((a, r) => a + r.response_count, 0);
        point[t] = count ? Number((total / count).toFixed(2)) : null;
      });
      return point;
    });
  }, [weekList, teams, filtered]);

  const exportCsv = () => {
    const header = ["semana", "time", "tipo", "media", "respostas", "respondentes", "destinatarios", "participacao_%"];
    const lines = filtered.map((r) => [
      r.week_start,
      r.sub_time,
      r.kind === "checkin" ? "check-in" : "check-out",
      r.avg_value ?? "",
      r.response_count,
      r.respondent_count,
      r.recipients_count,
      r.recipients_count ? ((r.respondent_count / r.recipients_count) * 100).toFixed(0) : "",
    ]);
    const csv = [header, ...lines].map((l) => l.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bem-estar-por-time-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-primary" /> Bem-estar por time
              </CardTitle>
              <CardDescription>
                Médias de check-in e check-out (1–5), respostas e participação semanal.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label className="text-xs">Período</Label>
                <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 semanas</SelectItem>
                    <SelectItem value="8">8 semanas</SelectItem>
                    <SelectItem value="12">12 semanas</SelectItem>
                    <SelectItem value="26">26 semanas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Check-in e out</SelectItem>
                    <SelectItem value="checkin">Check-in</SelectItem>
                    <SelectItem value="checkout">Check-out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Time</Label>
                <Select value={team} onValueChange={setTeam}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os times</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando bem-estar do time...</p>
          ) : isError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                Não foi possível carregar: {(error as any)?.message ?? "erro desconhecido"}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? "Tentando..." : "Tentar novamente"}
              </Button>
            </div>
          ) : !filtered.length ? (
            <p className="text-sm text-muted-foreground">Ainda não há respostas de check-in no período selecionado.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Média check-in</p>
                  <p className="text-2xl font-semibold tabular-nums">{fmt(curIn.avg)}</p>
                  <Delta current={curIn.avg} previous={prevIn.avg} />
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Média check-out</p>
                  <p className="text-2xl font-semibold tabular-nums">{fmt(curOut.avg)}</p>
                  <Delta current={curOut.avg} previous={prevOut.avg} />
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Respostas na semana</p>
                  <p className="text-2xl font-semibold tabular-nums">{curIn.responses + curOut.responses}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Participação</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {curIn.rate != null ? `${curIn.rate.toFixed(0)}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {curIn.respondents} de {curIn.recipients} pessoas
                  </p>
                </div>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="week" fontSize={12} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} fontSize={12} />
                    <Tooltip />
                    <Legend />
                    {teams.map((t, i) => (
                      <Line
                        key={t}
                        type="monotone"
                        dataKey={t}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">
                  Semana de {lastWeek ? format(parseISO(lastWeek), "dd 'de' MMMM", { locale: ptBR }) : "—"}
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead className="text-right">Check-in</TableHead>
                        <TableHead className="text-right">Check-out</TableHead>
                        <TableHead className="text-right">Respostas</TableHead>
                        <TableHead className="text-right">Respondentes</TableHead>
                        <TableHead className="text-right">Receberam</TableHead>
                        <TableHead className="text-right">Participação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableRows.map((r) => {
                        const responses = (r.in?.response_count ?? 0) + (r.out?.response_count ?? 0);
                        const respondents = Math.max(r.in?.respondent_count ?? 0, r.out?.respondent_count ?? 0);
                        const recipients = Math.max(r.in?.recipients_count ?? 0, r.out?.recipients_count ?? 0);
                        return (
                          <TableRow key={r.team}>
                            <TableCell className="font-medium">{r.team}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.in && r.in.avg_value == null && r.in.response_count > 0
                                ? <span className="text-xs text-muted-foreground">dados insuficientes</span>
                                : fmt(r.in?.avg_value ?? null)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.out && r.out.avg_value == null && r.out.response_count > 0
                                ? <span className="text-xs text-muted-foreground">dados insuficientes</span>
                                : fmt(r.out?.avg_value ?? null)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{responses}</TableCell>
                            <TableCell className="text-right tabular-nums">{respondents}</TableCell>
                            <TableCell className="text-right tabular-nums">{recipients}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {recipients ? `${((respondents / recipients) * 100).toFixed(0)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Para preservar o anonimato, semanas com menos de 3 respondentes em um time não exibem média.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
