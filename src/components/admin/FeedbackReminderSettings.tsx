import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, Save } from "lucide-react";
import {
  useFeedbackReminderSettings,
  useUpdateFeedbackReminderSettings,
  useFeedbackReminderCycles,
  useRunFeedbackReminders,
} from "@/hooks/useFeedbackReminderSettings";

export function FeedbackReminderSettings() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useFeedbackReminderSettings();
  const update = useUpdateFeedbackReminderSettings();
  const run = useRunFeedbackReminders();
  const { data: cycles } = useFeedbackReminderCycles();

  const [form, setForm] = useState({
    enabled: true,
    cycle_days: 15,
    overdue_days: 45,
    nudge_after_days: 3,
    max_nudges: 2,
    send_hour: 9,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        enabled: settings.enabled,
        cycle_days: settings.cycle_days,
        overdue_days: settings.overdue_days,
        nudge_after_days: settings.nudge_after_days,
        max_nudges: settings.max_nudges,
        send_hour: settings.send_hour,
      });
    }
  }, [settings]);

  const num = (key: keyof typeof form, min: number, max: number) => ({
    type: "number" as const,
    min,
    max,
    value: form[key] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })),
  });

  const handleSave = async () => {
    if (!settings) return;
    try {
      await update.mutateAsync({ id: settings.id, ...form });
      toast({ title: "Configuração salva", description: "A cobrança de feedbacks foi atualizada." });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  };

  const handleTest = async () => {
    try {
      const res = await run.mutateAsync({ dryRun: true });
      toast({
        title: "Simulação concluída",
        description: `${res?.managers ?? 0} gestor(es) receberiam cobrança agora.`,
      });
    } catch (e: any) {
      toast({ title: "Erro no teste", description: e.message, variant: "destructive" });
    }
  };

  const handleSendNow = async () => {
    try {
      const res = await run.mutateAsync({ dryRun: false });
      toast({
        title: "Lembretes enviados",
        description: `${res?.sent?.length ?? 0} gestor(es) notificados.`,
      });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading || !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cobrança de coleta de feedback</CardTitle>
          <CardDescription>Carregando...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const openCycles = (cycles || []).filter((c) => !c.resolved_at);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobrança de coleta de feedback</CardTitle>
        <CardDescription>
          Lembretes periódicos para cada gestor registrar feedback dos seus liderados, com repiques e alerta
          de coleta parada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label>Cobrança ativa</Label>
            <p className="text-sm text-muted-foreground">Desligue para pausar todos os lembretes.</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Cadência do ciclo (dias)</Label>
            <Input {...num("cycle_days", 1, 90)} />
            <p className="text-xs text-muted-foreground">Padrão 15 — início e meio do mês.</p>
          </div>
          <div className="space-y-2">
            <Label>Sem feedback há mais de (dias)</Label>
            <Input {...num("overdue_days", 7, 365)} />
          </div>
          <div className="space-y-2">
            <Label>Dias até o repique</Label>
            <Input {...num("nudge_after_days", 1, 30)} />
          </div>
          <div className="space-y-2">
            <Label>Máximo de repiques</Label>
            <Input {...num("max_nudges", 0, 5)} />
          </div>
          <div className="space-y-2">
            <Label>Horário de envio (São Paulo)</Label>
            <Input {...num("send_hour", 0, 23)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={update.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={run.isPending}>
            Simular
          </Button>
          <Button variant="outline" onClick={handleSendNow} disabled={run.isPending}>
            <Send className="h-4 w-4 mr-2" />
            Enviar agora
          </Button>
        </div>

        {openCycles.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <Label>Ciclos em aberto</Label>
            <div className="space-y-1">
              {openCycles.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>
                    {c.manager_id} — {c.pending_never} nunca avaliados, {c.pending_overdue} atrasados
                  </span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{c.nudges_sent} repique(s)</Badge>
                    {c.escalated_at && <Badge variant="destructive">Escalonado</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
