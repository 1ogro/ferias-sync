import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CalendarRange, TrendingDown, TrendingUp } from "lucide-react";
import { FeedbackTimelineItem } from "@/hooks/useFeedbacks";

export type CycleKind = "quarter" | "half" | "year";

interface CycleRow {
  key: string;
  label: string;
  kudos: number;
  peer: number;
  external: number;
  total: number;
  avgScore: number | null;
}

function cycleOf(date: Date, kind: CycleKind) {
  const y = date.getFullYear();
  const m = date.getMonth();
  if (kind === "year") return { key: `${y}`, label: `${y}`, index: y };
  if (kind === "half") {
    const h = m < 6 ? 1 : 2;
    return { key: `${y}-S${h}`, label: `${y} S${h}`, index: y * 2 + (h - 1) };
  }
  const q = Math.floor(m / 3) + 1;
  return { key: `${y}-T${q}`, label: `${y} T${q}`, index: y * 4 + (q - 1) };
}

function fromIndex(index: number, kind: CycleKind) {
  if (kind === "year") return { key: `${index}`, label: `${index}` };
  if (kind === "half") {
    const y = Math.floor(index / 2);
    const h = (index % 2) + 1;
    return { key: `${y}-S${h}`, label: `${y} S${h}` };
  }
  const y = Math.floor(index / 4);
  const q = (index % 4) + 1;
  return { key: `${y}-T${q}`, label: `${y} T${q}` };
}

function peerScore(item: FeedbackTimelineItem) {
  if (item.kind !== "peer" || !item.tag) return null;
  const n = Number(item.tag);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

export function FeedbackCyclesCard({
  items,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  items: FeedbackTimelineItem[];
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const [cycle, setCycle] = useState<CycleKind>("quarter");

  const { rows, avgPerCycle, avgScoreOverall } = useMemo(() => {
    const acc = new Map<number, CycleRow & { scoreSum: number; scoreCount: number }>();
    let scoreSum = 0;
    let scoreCount = 0;

    for (const it of items) {
      const d = new Date(it.occurred_at);
      if (Number.isNaN(d.getTime())) continue;
      const c = cycleOf(d, cycle);
      const cur =
        acc.get(c.index) ??
        {
          key: c.key,
          label: c.label,
          kudos: 0,
          peer: 0,
          external: 0,
          total: 0,
          avgScore: null,
          scoreSum: 0,
          scoreCount: 0,
        };
      cur.total += 1;
      if (it.kind === "kudo") cur.kudos += 1;
      else if (it.kind === "peer") cur.peer += 1;
      else cur.external += 1;
      const s = peerScore(it);
      if (s != null) {
        cur.scoreSum += s;
        cur.scoreCount += 1;
        scoreSum += s;
        scoreCount += 1;
      }
      acc.set(c.index, cur);
    }

    if (acc.size === 0) {
      return { rows: [] as CycleRow[], avgPerCycle: null as number | null, avgScoreOverall: null as number | null };
    }

    const indexes = Array.from(acc.keys());
    const min = Math.min(...indexes);
    const max = Math.max(...indexes);
    const out: CycleRow[] = [];
    for (let i = max; i >= min; i--) {
      const found = acc.get(i);
      if (found) {
        out.push({
          ...found,
          avgScore: found.scoreCount ? found.scoreSum / found.scoreCount : null,
        });
      } else {
        const meta = fromIndex(i, cycle);
        out.push({ ...meta, kudos: 0, peer: 0, external: 0, total: 0, avgScore: null });
      }
    }

    const totalCycles = out.length;
    const totalItems = out.reduce((a, r) => a + r.total, 0);
    return {
      rows: out,
      avgPerCycle: totalCycles ? totalItems / totalCycles : null,
      avgScoreOverall: scoreCount ? scoreSum / scoreCount : null,
    };
  }, [items, cycle]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" /> Evolução por ciclo
            </CardTitle>
            <CardDescription>
              Volume de feedbacks e médias por ciclo, considerando todo o histórico da pessoa.
            </CardDescription>
          </div>
          <div className="w-full sm:w-48">
            <Label className="text-xs">Ciclo</Label>
            <Select value={cycle} onValueChange={(v) => setCycle(v as CycleKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="half">Semestre</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando histórico...</p>
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Não foi possível carregar o histórico: {(error as any)?.message ?? "erro desconhecido"}
            </p>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                Tentar novamente
              </Button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há feedbacks registrados para esta pessoa.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Média de registros por ciclo</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {avgPerCycle != null ? avgPerCycle.toFixed(1) : "—"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Média das notas de pares</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {avgScoreOverall != null ? `${avgScoreOverall.toFixed(2)} / 5` : "—"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciclo</TableHead>
                    <TableHead className="text-right">Kudos</TableHead>
                    <TableHead className="text-right">Pares</TableHead>
                    <TableHead className="text-right">Externos</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Média (1-5)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const prev = rows[i + 1];
                    const totalDelta = prev ? r.total - prev.total : null;
                    const scoreDelta =
                      prev && prev.avgScore != null && r.avgScore != null ? r.avgScore - prev.avgScore : null;
                    return (
                      <TableRow key={r.key}>
                        <TableCell className="text-sm font-medium">{r.label}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.kudos}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.peer}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.external}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          <span className="inline-flex items-center gap-1 justify-end">
                            {r.total}
                            <Delta value={totalDelta} format={(v) => `${v > 0 ? "+" : ""}${v}`} />
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          <span className="inline-flex items-center gap-1 justify-end">
                            {r.avgScore != null ? r.avgScore.toFixed(2) : "—"}
                            <Delta value={scoreDelta} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`} />
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Delta({ value, format }: { value: number | null; format: (v: number) => string }) {
  if (value == null || value === 0) return null;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      <Icon className="h-3 w-3" />
      {format(value)}
    </span>
  );
}
