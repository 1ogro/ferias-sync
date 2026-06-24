import { useState } from "react";
import { usePulseSurveys, useTogglePulseActive, useDeletePulseSurvey, useDuplicatePulseSurvey, dispatchPulseNow, PulseSurvey } from "@/hooks/usePulses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Send, Power, Trash2, Pencil, Copy } from "lucide-react";
import { PulseFormDialog } from "./PulseFormDialog";
import { PulseResultsPanel } from "./PulseResultsPanel";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function PulsesTab() {
  const { person } = useAuth();
  const { toast } = useToast();
  const { data: surveys = [], isLoading } = usePulseSurveys();
  const toggleMut = useTogglePulseActive();
  const deleteMut = useDeletePulseSurvey();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PulseSurvey | null>(null);
  const [selected, setSelected] = useState<PulseSurvey | null>(null);


  const canCreate = person && (person.is_admin || ["DIRETOR", "ADMIN", "GESTOR"].includes(person.papel || ""));

  const handleDispatch = async (id: string) => {
    try {
      const r: any = await dispatchPulseNow(id);
      const result = r?.results?.[0];
      if (!result) {
        toast({ title: "Sem resultado", description: "Enquete não encontrada ou sem destinatários." });
        return;
      }
      const { sent, total, diagnostics = [] } = result;
      if (sent === total && total > 0) {
        toast({ title: "Disparado", description: `${sent}/${total} DMs enviadas.` });
      } else {
        const failures = diagnostics.filter((d: any) => d.status !== "sent");
        const summary = failures
          .slice(0, 5)
          .map((d: any) => `• ${d.nome || d.email}: ${d.status}${d.reason ? ` (${d.reason})` : ""}${d.needed ? ` [precisa: ${d.needed}]` : ""}`)
          .join("\n");
        console.warn("[pulse-dispatch diagnostics]", r);
        toast({
          title: `Disparo: ${sent}/${total} enviadas`,
          description: summary + (failures.length > 5 ? `\n…+${failures.length - 5}` : ""),
          variant: sent === 0 ? "destructive" : "default",
        });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Pulses de Performance</h2>
          <p className="text-sm text-muted-foreground">Enquetes periódicas enviadas via DM no Slack.</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nova enquete
          </Button>
        )}

      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : surveys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma enquete criada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {surveys.map((s) => (
            <Card
              key={s.id}
              className={`cursor-pointer hover:border-primary ${selected?.id === s.id ? "border-primary" : ""}`}
              onClick={() => setSelected(s)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Ativa" : "Inativa"}</Badge>
                      <Badge variant="outline">{s.frequency}</Badge>
                      {s.anonymous && <Badge variant="outline">🕶️</Badge>}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
                <div className="text-xs text-muted-foreground">
                  Próximo: {s.next_run_at ? new Date(s.next_run_at).toLocaleString("pt-BR") : "—"}
                </div>
                <div className="flex gap-2 pt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => handleDispatch(s.id)}>
                    <Send className="w-3 h-3 mr-1" /> Disparar
                  </Button>
                  {canCreate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditing(s); setOpen(true); }}
                    >
                      <Pencil className="w-3 h-3 mr-1" /> Editar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMut.mutate({ id: s.id, active: !s.active })}
                  >
                    <Power className="w-3 h-3 mr-1" /> {s.active ? "Pausar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Excluir enquete?")) deleteMut.mutate(s.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selected && <PulseResultsPanel survey={selected} />}

      <PulseFormDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        survey={editing}
      />

    </div>
  );
}
