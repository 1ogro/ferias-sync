import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Copy, Download, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  useMonthlyReport,
  useMonthlyContributors,
  MonthlyReportRow,
  ReportScope,
} from "@/hooks/useEngagementReport";

function previousMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, (m || 1) - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
}

function toCsv(rows: MonthlyReportRow[]) {
  const header = [
    "Colaborador",
    "Sub-time",
    "Kudos recebidos",
    "Kudos enviados",
    "Feedbacks de pares",
    "Feedbacks externos",
    "Total",
    "Último registro",
  ];
  const body = rows.map((r) => [
    r.nome,
    r.sub_time ?? "",
    r.kudos_received,
    r.kudos_given,
    r.peer_feedbacks,
    r.external_feedbacks,
    r.total,
    r.last_activity_at ? format(new Date(r.last_activity_at), "dd/MM/yyyy") : "",
  ]);
  return [header, ...body]
    .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

export function MonthlyReportPanel({ canSeeGlobal }: { canSeeGlobal?: boolean }) {
  const { toast } = useToast();
  const [month, setMonth] = useState(previousMonth());
  const [scope, setScope] = useState<ReportScope>(canSeeGlobal ? "global" : "team");

  const { data: rows = [], isLoading, isError, error, refetch, isFetching } = useMonthlyReport(month, scope);
  const { data: contributors = [] } = useMonthlyContributors(month, scope);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.kudosReceived += r.kudos_received;
        acc.kudosGiven += r.kudos_given;
        acc.peer += r.peer_feedbacks;
        acc.external += r.external_feedbacks;
        if (r.total > 0) acc.withActivity += 1;
        return acc;
      },
      { kudosReceived: 0, kudosGiven: 0, peer: 0, external: 0, withActivity: 0 }
    );
  }, [rows]);

  const withoutFeedback = useMemo(() => rows.filter((r) => r.total === 0), [rows]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome)), [rows]);

  const scopeLabel = scope === "global" ? "Toda a organização" : "Meu time";

  const exportCsv = () => {
    const blob = new Blob(["\uFEFF" + toCsv(sorted)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `engajamento-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySummary = async () => {
    const top = sorted.slice(0, 5).map((r) => `• ${r.nome}: ${r.total} registros`).join("\n");
    const text = [
      `*Relatório de engajamento — ${monthLabel(month)}* (${scopeLabel})`,
      `Kudos recebidos: ${totals.kudosReceived} | Kudos enviados: ${totals.kudosGiven}`,
      `Feedbacks de pares: ${totals.peer} | Feedbacks externos: ${totals.external}`,
      `Pessoas com ao menos um registro: ${totals.withActivity}/${rows.length}`,
      top ? `\nDestaques:\n${top}` : "",
      withoutFeedback.length
        ? `\nSem nenhum feedback no mês (${withoutFeedback.length}): ${withoutFeedback.map((r) => r.nome).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Resumo copiado", description: "Cole no Slack ou e-mail para a diretoria." });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Relatório mensal de engajamento
              </CardTitle>
              <CardDescription>
                {monthLabel(month)} · {scopeLabel}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copySummary} disabled={isLoading || isError}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar resumo
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={isLoading || isError || !rows.length}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Mês</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || previousMonth())} />
          </div>
          <div>
            <Label className="text-xs">Escopo</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ReportScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Meu time</SelectItem>
                <SelectItem value="global">Todo o escopo que eu acompanho</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Card>
          <CardContent className="py-8 space-y-2">
            <p className="text-sm text-destructive">
              Não foi possível carregar o relatório: {(error as any)?.message ?? "erro desconhecido"}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Tentando..." : "Tentar novamente"}
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Carregando relatório...</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "Kudos recebidos", value: totals.kudosReceived },
              { label: "Kudos enviados", value: totals.kudosGiven },
              { label: "Feedbacks de pares", value: totals.peer },
              { label: "Feedbacks externos", value: totals.external },
              { label: "Pessoas com registro", value: `${totals.withActivity}/${rows.length}` },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-2xl font-semibold">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {contributors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Gestores que registraram feedback externo</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {contributors.map((c) => (
                  <Badge key={c.author_id ?? c.author_name} variant="secondary" className="font-normal">
                    {c.author_name} <span className="text-muted-foreground ml-1">· {c.feedbacks}x</span>
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {withoutFeedback.length > 0 && (
            <Card className="border-amber-500/40">
              <CardContent className="py-4 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Sem nenhum feedback no mês ({withoutFeedback.length})</p>
                  <p className="text-muted-foreground">{withoutFeedback.map((r) => r.nome).join(", ")}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detalhe por colaborador</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {sorted.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum colaborador no escopo selecionado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Sub-time</TableHead>
                      <TableHead className="text-right">Kudos rec.</TableHead>
                      <TableHead className="text-right">Kudos env.</TableHead>
                      <TableHead className="text-right">Pares</TableHead>
                      <TableHead className="text-right">Externos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Último</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => (
                      <TableRow key={r.person_id}>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{r.sub_time ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.kudos_received}</TableCell>
                        <TableCell className="text-right">{r.kudos_given}</TableCell>
                        <TableCell className="text-right">{r.peer_feedbacks}</TableCell>
                        <TableCell className="text-right">{r.external_feedbacks}</TableCell>
                        <TableCell className="text-right font-semibold">{r.total}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {r.last_activity_at ? format(new Date(r.last_activity_at), "dd/MM/yyyy") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
