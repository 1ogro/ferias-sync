import { useMemo } from "react";
import { usePulseQuestions, usePulseResponses, usePulseRuns, downloadPulseExport, PulseSurvey } from "@/hooks/usePulses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  survey: PulseSurvey;
}

export function PulseResultsPanel({ survey }: Props) {
  const { toast } = useToast();
  const { data: questions = [] } = usePulseQuestions(survey.id);
  const { data: runs = [] } = usePulseRuns(survey.id);
  const { data: responses = [] } = usePulseResponses(survey.id);

  const stats = useMemo(() => {
    const totalRecipients = runs.reduce((a, r: any) => a + (r.recipients_count || 0), 0);
    const respondents = new Set(
      responses
        .filter((r: any) => r.respondent_id || r.anonymous_label)
        .map((r: any) => r.respondent_id || r.anonymous_label)
    );
    const responseRate = totalRecipients > 0 ? (respondents.size / totalRecipients) * 100 : 0;
    const byQuestion = new Map<string, number[]>();
    responses.forEach((r: any) => {
      if (r.scale_value != null) {
        if (!byQuestion.has(r.question_id)) byQuestion.set(r.question_id, []);
        byQuestion.get(r.question_id)!.push(r.scale_value);
      }
    });
    return { totalRecipients, respondents: respondents.size, responseRate, byQuestion };
  }, [responses, runs]);

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      await downloadPulseExport(survey.id, format);
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e.message, variant: "destructive" });
    }
  };

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
          <div className="flex gap-2">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Disparos" value={runs.length} />
          <Stat label="Destinatários" value={stats.totalRecipients} />
          <Stat label="Respondentes" value={stats.respondents} />
          <Stat label="Taxa de resposta" value={`${stats.responseRate.toFixed(0)}%`} />
        </div>

        <div>
          <h4 className="font-medium mb-2">Médias por pergunta (escala 1-5)</h4>
          <div className="space-y-1 text-sm">
            {questions.filter((q: any) => q.question_type === "scale_1_5").map((q: any) => {
              const vals = stats.byQuestion.get(q.id!) || [];
              const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "—";
              return (
                <div key={q.id} className="flex justify-between border-b py-1">
                  <span>{q.question_text}</span>
                  <span className="font-mono">{avg} <span className="text-muted-foreground">({vals.length})</span></span>
                </div>
              );
            })}
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
                        {survey.anonymous ? r.anonymous_label || "—" : r.respondent_id || "—"}
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
