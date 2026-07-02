import { useMemo, useState } from "react";
import { usePeerReviewPairs, usePulseRuns, PulseSurvey } from "@/hooks/usePulses";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  survey: PulseSurvey;
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function PeerReviewPairsSection({ survey }: Props) {
  const { data: pairs = [], isLoading } = usePeerReviewPairs(survey.id);
  const { data: runs = [] } = usePulseRuns(survey.id);
  const [runFilter, setRunFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "done" | "pending">("all");

  const filtered = useMemo(() => {
    return pairs.filter((p) => {
      if (runFilter !== "all" && p.run_id !== runFilter) return false;
      const done = !!p.completed_at;
      if (statusFilter === "done" && !done) return false;
      if (statusFilter === "pending" && done) return false;
      return true;
    });
  }, [pairs, runFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter((p) => !!p.completed_at).length;
    const pending = total - done;
    const rate = total > 0 ? (done / total) * 100 : 0;
    return { total, done, pending, rate };
  }, [filtered]);

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-medium">Pares de peer review</h4>
        <div className="flex gap-2">
          <Select value={runFilter} onValueChange={setRunFilter}>
            <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Execução" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as execuções</SelectItem>
              {runs.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>
                  {new Date(r.dispatched_at || r.created_at).toLocaleDateString("pt-BR")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="done">Respondidos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Pares" value={stats.total} />
        <Stat label="Respondidos" value={stats.done} />
        <Stat label="Pendentes" value={stats.pending} />
        <Stat label="Conclusão" value={`${stats.rate.toFixed(0)}%`} />
      </div>

      <div className="rounded border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Revisor</TableHead>
              <TableHead>Avaliado</TableHead>
              <TableHead>Enviado em</TableHead>
              <TableHead>Lembretes</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum par encontrado</TableCell></TableRow>
            )}
            {filtered.map((p) => {
              const done = !!p.completed_at;
              return (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">
                    {survey.peer_anonymous ? <span className="text-muted-foreground italic">Anônimo</span> : (p.reviewer_nome || p.reviewer_id)}
                  </TableCell>
                  <TableCell className="text-xs">{p.subject_nome || p.subject_id}</TableCell>
                  <TableCell className="text-xs">{fmt(p.sent_at)}</TableCell>
                  <TableCell className="text-xs">{p.reminders_sent_count ?? 0}</TableCell>
                  <TableCell className="text-xs">
                    {done ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Respondido {fmt(p.completed_at)}</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">Pendente</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
