import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, HeartPulse } from "lucide-react";
import { format } from "date-fns";
import { parseDateSafely } from "@/lib/dateUtils";
import { useWellbeingTeamWeekly, WellbeingRow, WellbeingSelection } from "@/hooks/useWellbeing";

const COLORS = ["hsl(var(--primary))", "hsl(var(--status-approved))", "hsl(var(--status-pending))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"];
const labels = { checkin: "Check-in", checkout: "Check-out", both: "Check-in e check-out" };
const statuses = { empty: "Sem notas", available: "Disponível" };
const dateLabel = (iso: string) => format(parseDateSafely(iso), "dd/MM/yyyy");
const average = (row?: WellbeingRow) => row?.avg_value == null
  ? "—"
  : row.avg_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (row?: WellbeingRow) => row?.recipients_count
  ? `${(100 * row.responded_deliveries / row.recipients_count).toFixed(0)}%` : "—";
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function WellbeingTeamPanel() {
  const [weeks, setWeeks] = useState(12);
  const [team, setTeam] = useState("all");
  const [kind, setKind] = useState<WellbeingSelection>("both");
  const { data, isLoading, isError, error, refetch, isFetching } = useWellbeingTeamWeekly({ weeks, subTime: team === "all" ? null : team });
  const rows = data?.rows ?? [];
  const teams = data?.teams ?? [];
  const visibleTeams = team === "all" ? teams : [team];
  const kinds = kind === "both" ? ["checkin", "checkout"] as const : [kind];
  const summary = (type: WellbeingSelection) => rows.find(r => r.level === "period" && r.kind === type && (team === "all" ? r.scope === "total" : r.sub_time === team));
  const total = summary(kind);
  const weekly = rows.filter(r => r.level === "week" && r.kind === kind);
  const hasChartPoints = weekly.some(r => r.avg_value != null);
  const series = [{ key: "overall", name: team === "all" ? "Geral" : team, scope: team === "all" ? "total" : "team", team: team === "all" ? null : team },
    ...(team === "all" ? visibleTeams.map((t, i) => ({ key: `team${i}`, name: t, scope: "team", team: t })) : [])];
  const chartData = useMemo(() => {
    const dates = Array.from(new Set(weekly.flatMap(r => r.week_start ? [r.week_start] : []))).sort();
    return dates.map(date => {
      const point: Record<string, string | number | null> = { week: dateLabel(date) };
      series.forEach(s => {
        const row = weekly.find(r => r.week_start === date && r.scope === s.scope && r.sub_time === s.team);
        point[s.key] = row?.avg_value ?? null;
      });
      return point;
    });
  }, [data, kind, team]);
  const exportCsv = () => {
    if (!data) return;
    const exportRows = rows.filter(r => kind === "both" || r.kind === kind);
    const header = ["nivel", "inicio_periodo", "fim_periodo", "semana", "escopo", "time", "tipo", "media", "notas", "pessoas_distintas", "envios", "envios_respondidos", "participacao_%", "situacao"];
    const csv = [header, ...exportRows.map(r => [r.level === "period" ? "Resumo do período" : "Semanal", data.period_start, data.period_end, r.week_start, r.scope === "total" ? "Geral" : "Time", r.sub_time ?? "Todos os times", labels[r.kind], r.avg_value, r.response_count, r.respondent_count, r.recipients_count, r.responded_deliveries, r.recipients_count ? (100 * r.responded_deliveries / r.recipients_count).toFixed(2) : "", statuses[r.status]])].map(line => line.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `bem-estar-${data.period_start}-${data.period_end}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <section className="space-y-6" aria-label="Bem-estar por time">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><HeartPulse className="h-4 w-4 text-primary" /> Bem-estar por time</h2>
        {data && <p className="text-sm text-muted-foreground">Período: {dateLabel(data.period_start)} a {dateLabel(data.period_end)} · São Paulo</p>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="wellbeing-period" className="text-xs">Período</Label><Select value={String(weeks)} onValueChange={v => setWeeks(Number(v))}><SelectTrigger id="wellbeing-period" className="h-9 w-36"><SelectValue /></SelectTrigger><SelectContent>{[4, 8, 12, 26].map(w => <SelectItem key={w} value={String(w)}>{w} semanas</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="wellbeing-kind" className="text-xs">Tipo</Label><Select value={kind} onValueChange={v => setKind(v as WellbeingSelection)}><SelectTrigger id="wellbeing-kind" className="h-9 w-52"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(labels).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="wellbeing-team" className="text-xs">Time</Label><Select value={team} onValueChange={setTeam}><SelectTrigger id="wellbeing-team" className="h-9 w-56 max-w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os times</SelectItem>{Array.from(new Set([...teams, ...(team === "all" ? [] : [team])])).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!data || isFetching || isError}><Download className="mr-1 h-4 w-4" /> CSV</Button>
      </div>
    </div>
    {isLoading ? <p className="text-sm text-muted-foreground">Carregando bem-estar do time...</p> : isError ? <div className="space-y-2"><p className="text-sm text-destructive">Não foi possível carregar: {error instanceof Error ? error.message : "erro desconhecido"}</p><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Tentar novamente</Button></div> : <>
      <p className="text-xs text-muted-foreground">Visão agregada de todos os perfis. Relatórios de pulses com acesso parcial podem omitir respostas de gerentes e diretores.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kinds.map(k => <div key={k} className="border-l-2 border-primary pl-4" data-testid={`summary-${k}`}><p className="text-sm text-muted-foreground">Média {labels[k].toLowerCase()}</p><p className="text-2xl font-semibold tabular-nums">{average(summary(k))}</p><p className="text-xs text-muted-foreground">{summary(k)?.response_count ?? 0} notas no período</p></div>)}
        <div className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">Notas no período</p><p className="text-2xl font-semibold tabular-nums">{total?.response_count ?? 0}</p><p className="text-xs text-muted-foreground">{total?.respondent_count ?? 0} pessoas distintas</p></div>
        <div className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">Participação nos envios</p><p className="text-2xl font-semibold tabular-nums">{rate(total)}</p><p className="text-xs text-muted-foreground">{total?.responded_deliveries ?? 0} de {total?.recipients_count ?? 0} envios respondidos</p></div>
      </div>
      {!total?.response_count && <p className="text-sm text-muted-foreground">Sem notas no período selecionado.</p>}
      <div className="space-y-3" aria-label="Evolução semanal"><h3 className="text-sm font-medium">Evolução semanal · {labels[kind]}</h3>
        {hasChartPoints ? <div className="h-80 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="week" fontSize={11} /><YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} fontSize={12} /><Tooltip /><Legend />{series.map((s, i) => chartData.some(point => point[s.key] != null) ? <Line key={s.key} name={s.name} dataKey={s.key} stroke={COLORS[i % COLORS.length]} strokeWidth={s.key === "overall" ? 3 : 2} dot={{ r: 3 }} connectNulls={false} /> : null)}</LineChart></ResponsiveContainer></div> :
          <p className="py-8 text-sm text-muted-foreground" role="status">Sem respostas no período selecionado.</p>}
      </div>
      <div><h3 className="mb-2 text-sm font-medium">Resumo por time · período selecionado</h3><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead>{kinds.map(k => <TableHead key={k} className="text-right">{labels[k]}</TableHead>)}<TableHead className="text-right">Notas</TableHead><TableHead className="text-right">Pessoas distintas</TableHead><TableHead className="text-right">Envios respondidos</TableHead><TableHead className="text-right">Participação</TableHead></TableRow></TableHeader><TableBody>{visibleTeams.map(t => {
        const values = rows.filter(r => r.level === "period" && r.scope === "team" && r.sub_time === t);
        const selected = values.find(r => r.kind === kind);
        return <TableRow key={t}><TableCell className="font-medium">{t}</TableCell>{kinds.map(k => { const value = values.find(r => r.kind === k); return <TableCell key={k} className="text-right tabular-nums">{average(value)}</TableCell>; })}<TableCell className="text-right">{selected?.response_count ?? 0}</TableCell><TableCell className="text-right">{selected?.respondent_count ?? 0}</TableCell><TableCell className="text-right">{selected?.responded_deliveries ?? 0} / {selected?.recipients_count ?? 0}</TableCell><TableCell className="text-right">{rate(selected)}</TableCell></TableRow>;
      })}</TableBody></Table></div></div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Detalhamento semanal</summary><div className="mt-2 max-h-80 overflow-auto"><Table><TableHeader><TableRow><TableHead>Semana</TableHead><TableHead>Time</TableHead><TableHead>Média</TableHead><TableHead>Notas</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>{weekly.map((r, i) => <TableRow key={i}><TableCell>{r.week_start ? dateLabel(r.week_start) : "—"}</TableCell><TableCell>{r.sub_time ?? "Geral"}</TableCell><TableCell>{average(r)}</TableCell><TableCell>{r.response_count}</TableCell><TableCell>{statuses[r.status]}</TableCell></TableRow>)}</TableBody></Table></div></details>
      <p className="text-xs text-muted-foreground">Participação considera cada pessoa por envio; notas de disparos sem destinatários permanecem nas médias.</p>
    </>}
  </section>;
}
