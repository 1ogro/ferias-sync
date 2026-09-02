import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { MessagesSquare, Trash2, Paperclip, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { ExternalFeedbackDialog } from "./ExternalFeedbackDialog";
import {
  useFeedbackScope,
  useFeedbackTimeline,
  useDeleteExternalFeedback,
  useToggleFeedbackVisibility,
  getSignedAttachmentUrl,
  FeedbackTimelineItem,
} from "@/hooks/useFeedbacks";

const KIND_META: Record<FeedbackTimelineItem["kind"], { label: string; className: string }> = {
  kudo: { label: "Kudo", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  peer: { label: "Pares / Pulse", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  external: { label: "Externo", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};

const PERIODS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
  { value: "all", label: "Tudo" },
];

function sinceIso(period: string) {
  if (period === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - Number(period));
  return d.toISOString();
}

function AttachmentLink({ path, name }: { path: string; name: string }) {
  const { toast } = useToast();
  const open = async () => {
    try {
      const url = await getSignedAttachmentUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Não foi possível abrir o anexo", description: e.message, variant: "destructive" });
    }
  };
  return (
    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={open}>
      <Paperclip className="h-3 w-3 mr-1" /> {name}
    </Button>
  );
}

export function FeedbackProfilePanel({ authorId }: { authorId?: string }) {
  const { toast } = useToast();
  const { data: people = [], isLoading: loadingPeople } = useFeedbackScope();
  const [personId, setPersonId] = useState<string>("");
  const [period, setPeriod] = useState("90");
  const [kind, setKind] = useState<"all" | FeedbackTimelineItem["kind"]>("all");

  const { data: items = [], isLoading } = useFeedbackTimeline(personId || undefined, sinceIso(period));
  const deleteMut = useDeleteExternalFeedback();
  const visibilityMut = useToggleFeedbackVisibility();

  const filtered = useMemo(
    () => (kind === "all" ? items : items.filter((i) => i.kind === kind)),
    [items, kind]
  );

  const selectedPerson = people.find((p) => p.id === personId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-primary" /> Feedbacks por perfil
              </CardTitle>
              <CardDescription>
                Kudos, feedbacks de pares e registros de stakeholders externos das pessoas do seu escopo.
              </CardDescription>
            </div>
            <ExternalFeedbackDialog authorId={authorId} defaultPersonId={personId || undefined} />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Colaborador</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingPeople ? "Carregando..." : "Selecione um colaborador"} />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}{p.cargo ? ` · ${p.cargo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!personId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Users className="h-6 w-6" />
            Selecione um colaborador para ver a linha do tempo de feedbacks.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">{selectedPerson?.nome ?? "Colaborador"}</CardTitle>
              <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
                <TabsList>
                  <TabsTrigger value="all">Todos</TabsTrigger>
                  <TabsTrigger value="kudo">Kudos</TabsTrigger>
                  <TabsTrigger value="peer">Pares</TabsTrigger>
                  <TabsTrigger value="external">Externos</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[28rem] pr-3">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando feedbacks...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum feedback no recorte selecionado.</p>
              ) : (
                <ul className="space-y-3">
                  {filtered.map((it) => (
                    <li key={it.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={KIND_META[it.kind].className} variant="secondary">
                            {KIND_META[it.kind].label}
                          </Badge>
                          {it.tag && <Badge variant="outline">{it.tag}</Badge>}
                          <span className="text-sm font-medium">{it.author_label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(it.occurred_at), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                      {it.title && <p className="text-xs text-muted-foreground">{it.title}</p>}
                      <p className="text-sm whitespace-pre-wrap">{it.content}</p>

                      {it.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {it.attachments.map((a) => (
                            <AttachmentLink key={a.id} path={a.storage_path} name={a.file_name} />
                          ))}
                        </div>
                      )}

                      {it.kind === "external" && (
                        <div className="flex items-center justify-between gap-3 pt-2 border-t">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch
                              checked={it.visible_to_subject}
                              onCheckedChange={(v) =>
                                visibilityMut.mutate(
                                  { feedbackId: it.id.replace(/^ext:/, ""), visible: v },
                                  { onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }) }
                                )
                              }
                            />
                            Visível para o colaborador
                          </label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (!confirm("Excluir este feedback externo?")) return;
                              deleteMut.mutate(it.id.replace(/^ext:/, ""), {
                                onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
