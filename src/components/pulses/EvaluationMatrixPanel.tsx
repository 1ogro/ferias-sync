import { useMemo, useState } from "react";
import { useEvaluationMatrix, useEvaluationComments, usePulseRuns, PulseSurvey, EvaluationMatrixRow } from "@/hooks/usePulses";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download } from "lucide-react";
import { EVALUATION_FORMAT_LABEL } from "./evaluationCriteria";

const GAP_LIMIT = 0.8;
const DIM_LABEL: Record<string, string> = { self: "Autoavaliação", manager: "Gestor", peer: "Pares" };

type Dim = "self" | "manager" | "peer";
interface SubjectSummary {
  id: string;
  nome: string;
  sub_time: string | null;
  papel: string | null;
  contrato: string | null;
  avg: Partial<Record<Dim, number>>;
  others: number | null;
  gap: number | null;
  total: number;
  done: number;
  rows: EvaluationMatrixRow[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const isPJ = (c: string | null) => (c || "CLT") === "PJ";

export function summarize(rows: EvaluationMatrixRow[]): SubjectSummary[] {
  const by = new Map<string, EvaluationMatrixRow[]>();
  rows.forEach((r) => by.set(r.subject_id, [...(by.get(r.subject_id) || []), r]));
  return [...by.entries()].map(([id, rs]) => {
    const avg: Partial<Record<Dim, number>> = {};
    (["self", "manager", "peer"] as Dim[]).forEach((d) => {
      const m = mean(rs.filter((r) => r.dimension === d && r.avg_score != null).map((r) => r.avg_score!));
      if (m != null) avg[d] = m;
    });
    const othersList = [avg.manager, avg.peer].filter((x): x is number => x != null);
    const others = mean(othersList);
    const gap = avg.self != null && others != null ? avg.self - others : null;
    // pair counts repeat per question row; take one per dimension
    const seen = new Map<string, { t: number; d: number }>();
    rs.forEach((r) => seen.set(r.dimension, { t: r.pairs_total, d: r.pairs_done }));
    let total = 0, done = 0;
    seen.forEach((v) => { total += v.t; done += v.d; });
    const f = rs[0];
    return { id, nome: f.subject_nome, sub_time: f.sub_time, papel: f.papel, contrato: f.modelo_contrato, avg, others, gap, total, done, rows: rs };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function GapBadge({ gap }: { gap: number | null }) {
  if (gap == null) return <span className="text-muted-foreground">—</span>;
  const label = `${gap > 0 ? "+" : ""}${gap.toFixed(1)}`;
  if (gap > GAP_LIMIT) return <Badge variant="destructive" title="Autoavaliação bem acima da percepção dos outros">{label} ponto cego</Badge>;
  if (gap < -GAP_LIMIT) return <Badge variant="secondary" title="Se avalia bem abaixo do que os outros percebem">{label} subavaliação</Badge>;
  return <Badge variant="outline">{label} alinhado</Badge>;
}

export function EvaluationMatrixPanel({ survey }: { survey: PulseSurvey }) {
  const { data: runs = [] } = usePulseRuns(survey.id);
  const [runId, setRunId] = useState<string>("all");
  const [team, setTeam] = useState("all");
  const [contract, setContract] = useState("all");
  const [selected, setSelected] = useState<SubjectSummary | null>(null);
  const { data: rows = [], isLoading, error } = useEvaluationMatrix(survey.id, runId === "all" ? null : runId);
  const fmtKey = (survey as any).evaluation_format as string;

  const all = useMemo(() => summarize(rows), [rows]);
  const teams = useMemo(() => [...new Set(all.map((s) => s.sub_time).filter(Boolean))].sort() as string[], [all]);
  const list = all.filter((s) =>
    (team === "all" || s.sub_time === team) &&
    (contract === "all" || (contract === "pj" ? isPJ(s.contrato) : !isPJ(s.contrato)))
  );

  const exportCsv = () => {
    const head = ["Pessoa", "Time", "Papel", "Contrato", "Autoavaliação", "Gestor", "Pares", "Outros (média)", "GAP", "Concluídas", "Total"];
    const lines = list.map((s) => [s.nome, s.sub_time ?? "", s.papel ?? "", s.contrato ?? "", fmt(s.avg.self), fmt(s.avg.manager), fmt(s.avg.peer), fmt(s.others), s.gap == null ? "" : s.gap.toFixed(2), s.done, s.total]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `matriz-${fmtKey}-${survey.title}.csv`;
    a.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="font-medium">Matriz consolidada</h4>
          <p className="text-xs text-muted-foreground">{EVALUATION_FORMAT_LABEL[fmtKey]} · GAP = autoavaliação − média de gestor e pares</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={runId} onValueChange={setRunId}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os ciclos</SelectItem>
              {runs.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>{new Date(r.dispatched_at || r.created_at).toLocaleDateString("pt-BR")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os times</SelectItem>
              {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contract} onValueChange={setContract}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">CLT e PJ</SelectItem>
              <SelectItem value="clt">Apenas CLT</SelectItem>
              <SelectItem value="pj">Apenas PJ</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!list.length}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <div className="rounded border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead className="text-right">Auto</TableHead>
              <TableHead className="text-right">Gestor</TableHead>
              <TableHead className="text-right">Pares</TableHead>
              <TableHead>Alinhamento</TableHead>
              <TableHead className="text-right">Coleta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>}
            {error && <TableRow><TableCell colSpan={6} className="text-center text-destructive py-6">{(error as any).message}</TableCell></TableRow>}
            {!isLoading && !error && list.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma avaliação disparada ainda</TableCell></TableRow>
            )}
            {list.map((s) => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                <TableCell>
                  <div className="font-medium text-sm">{s.nome}</div>
                  <div className="text-xs text-muted-foreground">{[s.sub_time, s.papel, s.contrato].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.avg.self)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.avg.manager)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.avg.peer)}</TableCell>
                <TableCell><GapBadge gap={s.gap} /></TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.done}/{s.total} ({s.total ? Math.round((s.done / s.total) * 100) : 0}%)
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && <SubjectDetail survey={survey} s={selected} runId={runId === "all" ? null : runId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SubjectDetail({ survey, s, runId }: { survey: PulseSurvey; s: SubjectSummary; runId: string | null }) {
  const { data: comments = [], isLoading } = useEvaluationComments(survey.id, s.id, runId);
  const questions = useMemo(() => {
    const m = new Map<string, { text: string; pos: number; v: Partial<Record<Dim, number>> }>();
    s.rows.forEach((r) => {
      if (!r.question_id || r.avg_score == null) return;
      const q = m.get(r.question_id) || { text: r.question_text || "", pos: r.question_position ?? 0, v: {} };
      q.v[r.dimension] = r.avg_score;
      m.set(r.question_id, q);
    });
    return [...m.values()].sort((a, b) => a.pos - b.pos);
  }, [s]);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{s.nome}</SheetTitle>
        <SheetDescription>{[s.sub_time, s.papel, s.contrato].filter(Boolean).join(" · ")}</SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-5">
        <div className="grid grid-cols-4 gap-2 text-center">
          {(["self", "manager", "peer"] as Dim[]).map((d) => (
            <div key={d} className="rounded border p-2">
              <div className="text-xs text-muted-foreground">{DIM_LABEL[d]}</div>
              <div className="text-xl font-semibold">{fmt(s.avg[d])}</div>
            </div>
          ))}
          <div className="rounded border p-2">
            <div className="text-xs text-muted-foreground">GAP</div>
            <div className="mt-1"><GapBadge gap={s.gap} /></div>
          </div>
        </div>

        <div className="space-y-3">
          <h5 className="text-sm font-medium">Por critério</h5>
          {questions.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem notas.</p>}
          {questions.map((q, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs">{q.text}</p>
              {(["self", "manager", "peer"] as Dim[]).map((d) => q.v[d] != null && (
                <div key={d} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-muted-foreground">{DIM_LABEL[d]}</span>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                    <div className={`h-full ${d === "self" ? "bg-primary" : d === "manager" ? "bg-accent-foreground" : "bg-muted-foreground"}`} style={{ width: `${(q.v[d]! / 5) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums">{q.v[d]!.toFixed(1)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h5 className="text-sm font-medium">Comentários</h5>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && comments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário.</p>}
          {comments.map((c, i) => (
            <div key={i} className="rounded border p-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{DIM_LABEL[c.dimension] || c.dimension}</Badge>
                <span>{c.author_label}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.text_value}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
