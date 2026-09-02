import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTeamSummary, ReportScope } from "@/hooks/useEngagementReport";

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, (m || 1) - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
}

export function TeamSummaryCard({ canSeeGlobal }: { canSeeGlobal?: boolean }) {
  const [month, setMonth] = useState(currentMonth());
  const [scope, setScope] = useState<ReportScope>(canSeeGlobal ? "global" : "team");
  const { data: rows = [], isLoading, isError, error, refetch, isFetching } = useTeamSummary(month, scope);

  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => {
        acc.people += r.people_count;
        acc.kudos += r.kudos;
        acc.peer += r.peer_feedbacks;
        acc.external += r.external_feedbacks;
        acc.total += r.total;
        return acc;
      },
      { people: 0, kudos: 0, peer: 0, external: 0, total: 0 }
    );
    return { ...t, avg: t.people ? t.total / t.people : 0 };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" /> Feedbacks por time
            </CardTitle>
            <CardDescription>
              Total de registros e média por colaborador em {monthLabel(month)}.
            </CardDescription>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Mês</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value || currentMonth())}
                className="h-9"
              />
            </div>
            {canSeeGlobal && (
              <div>
                <Label className="text-xs">Escopo</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as ReportScope)}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">Meu time</SelectItem>
                    <SelectItem value="global">Global</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando resumo por time...</p>
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Não foi possível carregar: {(error as any)?.message ?? "erro desconhecido"}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Tentando..." : "Tentar novamente"}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum time no escopo selecionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Pessoas</TableHead>
                  <TableHead className="text-right">Kudos</TableHead>
                  <TableHead className="text-right">Pares</TableHead>
                  <TableHead className="text-right">Externos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Média / pessoa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.sub_time}>
                    <TableCell className="font-medium">{r.sub_time}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.people_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.kudos}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.peer_feedbacks}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.external_feedbacks}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(r.avg_per_person ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Total geral</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{totals.people}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{totals.kudos}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{totals.peer}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{totals.external}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{totals.total}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{totals.avg.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
