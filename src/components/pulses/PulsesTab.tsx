import { useState } from "react";
import { usePulseSurveys, useTogglePulseActive, useDeletePulseSurvey, dispatchPulseNow, PulseSurvey } from "@/hooks/usePulses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Send, Power, Trash2 } from "lucide-react";
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
  const [selected, setSelected] = useState<PulseSurvey | null>(null);

  const canCreate = person && (person.is_admin || ["DIRETOR", "ADMIN", "GESTOR"].includes(person.papel || ""));

  const handleDispatch = async (id: string) => {
    try {
      const r = await dispatchPulseNow(id);
      toast({ title: "Disparo iniciado", description: JSON.stringify(r?.results || r) });
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
          <Button onClick={() => setOpen(true)}>
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
                <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => handleDispatch(s.id)}>
                    <Send className="w-3 h-3 mr-1" /> Disparar
                  </Button>
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

      <PulseFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
