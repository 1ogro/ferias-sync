import { useMemo, useState } from "react";
import {
  usePulseQuestions,
  usePulseResponses,
  usePulseRuns,
  usePulseWeeklyTrend,
  usePulseSurveyTeams,
  downloadPulseExport,
  PulseSurvey,
} from "@/hooks/usePulses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PeerReviewPairsSection } from "./PeerReviewPairsSection";
import { PulseTrendPanel } from "./PulseTrendPanel";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EyeOff } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  survey: PulseSurvey;
}

export function PulseResultsPanel({ survey }: Props) {
  const { toast } = useToast();
  const { person } = useAuth();
  const isPartialView =
    person?.papel === "GERENTE" && !person?.is_admin && survey.created_by !== person?.id;
  const { data: questions = [] } = usePulseQuestions(survey.id);
  const { data: runs = [] } = usePulseRuns(survey.id);
  const { data: allResponses = [] } = usePulseResponses(survey.id);

  const scaleQuestions = useMemo(
    () => (questions as any[]).filter((q) => q.question_type === "scale_1_5"),
    [questions]
  );

  const [weeks, setWeeks] = useState(12);
  const [subTime, setSubTime] = useState<string>("all");
  const [questionId, setQuestionId] = useState<string>("all");
  const [onlyComments, setOnlyComments] = useState(false);

  const canFilterTeams = !!person?.is_admin || person?.papel === "DIRETOR" || person?.papel === "GERENTE";
  const { data: teams = [] } = usePulseSurveyTeams(canFilterTeams ? survey.id : undefined);

  const trend = usePulseWeeklyTrend(survey.id, {
    weeks,
    subTime: subTime === "all" ? null : subTime,
    questionId: questionId === "all" ? null : questionId,
  });

  const responses = useMemo(() => {
    const cutoff = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
    return (allResponses as any[]).filter((r) => {
      if (questionId !== "all" && r.question_id !== questionId) return false;
      if (onlyComments && !r.text_value) return false;
      if (r.submitted_at && new Date(r.submitted_at).getTime() < cutoff) return false;
      return true;
    });
  }, [allResponses, questionId, onlyComments, weeks]);

  const filtersActive = questionId !== "all" || onlyComments || subTime !== "all" || weeks !== 12;


  const stats = useMemo(() => {
    const totalRecipients = runs.reduce((a, r: any) => a + (r.recipients_count || 0), 0);
    const respondents = new Set(
      responses
        .filter((r: any) => r.respondent_id || r.anonymous_label)
        .map((r: any) => r.respondent_id || r.anonymous_label)
    );
    const responseRate = totalRecipients > 0 ? (respondents.size / totalRecipients) * 100 : 0;

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const inWindow = (iso: string, days: number | null) =>
      days == null ? true : now - new Date(iso).getTime() <= days * DAY;

    const scaleResponses = responses.filter((r: any) => r.scale_value != null && r.submitted_at);

    const avgFor = (rows: any[], days: number | null) => {
      const vals = rows.filter((r) => inWindow(r.submitted_at, days)).map((r) => r.scale_value as number);
      const count = vals.length;
      const avg = count ? vals.reduce((a, b) => a + b, 0) / count : null;
      return { avg, count };
    };

    const byQuestion = new Map<string, { w7: { avg: number | null; count: number }; w30: { avg: number | null; count: number }; all: { avg: number | null; count: number } }>();
    for (const r of scaleResponses) {
      if (!byQuestion.has(r.question_id)) {
        byQuestion.set(r.question_id, { w7: { avg: null, count: 0 }, w30: { avg: null, count: 0 }, all: { avg: null, count: 0 } });
      }
    }
    byQuestion.forEach((_v, qid) => {
      const rows = scaleResponses.filter((r: any) => r.question_id === qid);
      byQuestion.set(qid, { w7: avgFor(rows, 7), w30: avgFor(rows, 30), all: avgFor(rows, null) });
    });

    const overall = {
      w7: avgFor(scaleResponses, 7),
      w30: avgFor(scaleResponses, 30),
      all: avgFor(scaleResponses, null),
    };

    return { totalRecipients, respondents: respondents.size, responseRate, byQuestion, overall };
  }, [responses, runs]);

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      await downloadPulseExport(survey.id, format);
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e.message, variant: "destructive" });
    }
  };

  const handleExportFiltered = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Data", "Respondente", "Pergunta", "Nota", "Comentário"];
    const lines = [header.join(",")];
    for (const r of responses as any[]) {
      const q = (questions as any[]).find((qq) => qq.id === r.question_id);
      lines.push(
        [
          esc(new Date(r.submitted_at).toLocaleString("pt-BR")),
          esc(survey.anonymous ? r.anonymous_label || "—" : r.respondent_name || r.respondent_id || "—"),
          esc(q?.question_text || "—"),
          esc(r.scale_value ?? ""),
          esc(r.text_value ?? ""),
        ].join(",")
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `pulse_${survey.id}_filtrado.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };


  const fmt = (a: { avg: number | null; count: number }) =>
    a.avg != null ? `${a.avg.toFixed(2)} (${a.count})` : `— (0)`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>{survey.title}</CardTitle>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant={survey.active ? "default" : "secondary"}>
                {survey.active ? "Ativa" : "Inativa"}
              </Badge>
              <Badge variant="outline">{survey.frequency}</Badge>
              {survey.anonymous && <Badge variant="outline">🕶️ Anônima</Badge>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {filtersActive && (
              <Button variant="secondary" size="sm" onClick={handleExportFiltered}>
                <Download className="w-4 h-4 mr-1" /> CSV filtrado
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
            </Button>
          </div>

        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isPartialView && (
          <Alert>
            <EyeOff className="h-4 w-4" />
            <AlertDescription>
              Visão parcial: respostas de gerentes e diretores ficam ocultas e as demais são exibidas sem identificação individual.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Disparos" value={runs.length} />
          <Stat label="Destinatários" value={stats.totalRecipients} />
          <Stat label="Respondentes" value={stats.respondents} />
          <Stat label="Taxa de resposta" value={`${stats.responseRate.toFixed(0)}%`} />
        </div>

        {scaleQuestions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-end gap-3 flex-wrap rounded border p-3">
              <div className="space-y-1">
                <Label className="text-xs">Período</Label>
                <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
                  <SelectTrigger className="w-[170px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">Últimas 4 semanas</SelectItem>
                    <SelectItem value="8">Últimas 8 semanas</SelectItem>
                    <SelectItem value="12">Últimas 12 semanas</SelectItem>
                    <SelectItem value="26">Últimas 26 semanas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {canFilterTeams && teams.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Time</Label>
                  <Select value={subTime} onValueChange={setSubTime}>
                    <SelectTrigger className="w-[180px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os times</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.sub_time} value={t.sub_time}>
                          {t.sub_time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {scaleQuestions.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Pergunta</Label>
                  <Select value={questionId} onValueChange={setQuestionId}>
                    <SelectTrigger className="w-[260px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as perguntas</SelectItem>
                      {scaleQuestions.map((q: any) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.question_text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-2 h-9">
                <Switch id="only-comments" checked={onlyComments} onCheckedChange={setOnlyComments} />
                <Label htmlFor="only-comments" className="text-xs">
                  Somente com comentário
                </Label>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Evolução semanal (escala 1-5)</h4>
              <PulseTrendPanel data={trend.data || []} isLoading={trend.isLoading} error={trend.error} />
            </div>
          </div>
        )}

        <div>
          <h4 className="font-medium mb-2">Média geral da pesquisa (escala 1-5)</h4>
          <div className="grid grid-cols-3 gap-3">

            <AvgStat label="Geral" data={stats.overall.all} />
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-2">Médias por pergunta (escala 1-5)</h4>
          <div className="rounded border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pergunta</TableHead>
                  <TableHead className="text-right">Semanal (7d)</TableHead>
                  <TableHead className="text-right">Mensal (30d)</TableHead>
                  <TableHead className="text-right">Geral</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.filter((q: any) => q.question_type === "scale_1_5").map((q: any) => {
                  const agg = stats.byQuestion.get(q.id!) || { w7: { avg: null, count: 0 }, w30: { avg: null, count: 0 }, all: { avg: null, count: 0 } };
                  return (
                    <TableRow key={q.id}>
                      <TableCell className="text-sm">{q.question_text}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(agg.w7)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(agg.w30)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(agg.all)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>


        <div>
          <h4 className="font-medium mb-2">Respostas recentes</h4>
          <div className="rounded border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Respondente</TableHead>
                  <TableHead>Pergunta</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responses.slice(0, 50).map((r: any) => {
                  const q = questions.find((qq: any) => qq.id === r.question_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.submitted_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-xs">
                        {survey.anonymous ? r.anonymous_label || "—" : r.respondent_name || r.respondent_id || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{q?.question_text || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.scale_value != null ? `${r.scale_value}/5` : r.text_value || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {responses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Nenhuma resposta ainda
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        {survey.kind === "peer" && <PeerReviewPairsSection survey={survey} />}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function AvgStat({ label, data }: { label: string; data: { avg: number | null; count: number } }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-semibold tabular-nums">
          {data.avg != null ? data.avg.toFixed(2) : "—"}
        </span>
        <span className="text-xs text-muted-foreground">/ 5</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {data.count} resposta{data.count === 1 ? "" : "s"}
      </div>
    </div>
  );
}
