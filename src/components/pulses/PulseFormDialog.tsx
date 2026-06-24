import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useCreatePulseSurvey,
  useUpdatePulseSurvey,
  usePulseQuestions,
  usePulseRuns,
  PulseQuestion,
  PulseFrequency,
  PulseSurvey,
} from "@/hooks/usePulses";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  survey?: PulseSurvey | null;
}

function toLocalInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 30 * 60_000);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

export function PulseFormDialog({ open, onOpenChange, survey }: Props) {
  const { person } = useAuth();
  const { toast } = useToast();
  const createMut = useCreatePulseSurvey();
  const updateMut = useUpdatePulseSurvey();
  const isEdit = !!survey;

  const { data: existingQuestions } = usePulseQuestions(survey?.id);
  const { data: runs } = usePulseRuns(survey?.id);
  const hasResponses = (runs || []).some((r: any) => (r.responses_count || 0) > 0);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [tone, setTone] = useState<"formal" | "neutral" | "casual">("neutral");
  const [kind, setKind] = useState<"self" | "peer" | "kudos">("self");
  const [peerAnonymous, setPeerAnonymous] = useState(true);
  const [kudosCategories, setKudosCategories] = useState<string[]>([
    "teamwork", "innovation", "delivery", "leadership", "customer",
  ]);
  const [kudosChannel, setKudosChannel] = useState<string>("");
  const [promptText, setPromptText] = useState<string>("");
  const [frequency, setFrequency] = useState<PulseFrequency>("once");
  const [nextRunAt, setNextRunAt] = useState<string>(() => toLocalInput(null));
  const [targetScope, setTargetScope] = useState<"team" | "custom">("team");
  const [targetTeamId, setTargetTeamId] = useState<string>("");
  const [targetPersonIds, setTargetPersonIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<PulseQuestion[]>([
    { position: 0, question_text: "", question_type: "scale_1_5", required: true },
  ]);


  const [teams, setTeams] = useState<string[]>([]);
  const [people, setPeople] = useState<{ id: string; nome: string; sub_time: string | null }[]>([]);

  const isDirectorOrAdmin = person?.papel === "DIRETOR" || person?.is_admin;

  useEffect(() => {
    if (!open) return;
    (async () => {
      let q = supabase.from("people").select("id, nome, sub_time").eq("ativo", true);
      if (!isDirectorOrAdmin && person?.subTime) {
        q = q.eq("sub_time", person.subTime);
      }
      const { data } = await q.order("nome");
      const list = (data || []) as any[];
      setPeople(list);
      setTeams([...new Set(list.map((p) => p.sub_time).filter(Boolean))] as string[]);
      if (!isEdit && !isDirectorOrAdmin && person?.subTime) setTargetTeamId(person.subTime);
    })();
  }, [open, isDirectorOrAdmin, person?.subTime, isEdit]);

  // Pre-populate when editing
  useEffect(() => {
    if (!open) return;
    if (isEdit && survey) {
      setTitle(survey.title);
      setDescription(survey.description || "");
      setAnonymous(survey.anonymous);
      setTone(((survey as any).tone || "neutral") as any);
      setKind(((survey as any).kind || "self") as any);
      setPeerAnonymous((survey as any).peer_anonymous ?? true);
      setKudosCategories(((survey as any).kudos_categories as string[] | null) ?? [
        "teamwork", "innovation", "delivery", "leadership", "customer",
      ]);
      setKudosChannel((survey as any).kudos_channel || "");
      setPromptText((survey as any).prompt_text || "");

      setFrequency(survey.frequency);
      setNextRunAt(toLocalInput(survey.next_run_at));
      setTargetScope(survey.target_scope);
      setTargetTeamId(survey.target_team_id || "");
      setTargetPersonIds(survey.target_person_ids || []);
    } else if (!isEdit) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, survey?.id]);

  useEffect(() => {
    if (isEdit && existingQuestions && existingQuestions.length) {
      setQuestions(existingQuestions.map((q, i) => ({ ...q, position: i })));
    }
  }, [isEdit, existingQuestions]);

  const addQuestion = () =>
    setQuestions((q) => [...q, { position: q.length, question_text: "", question_type: "scale_1_5", required: true }]);
  const removeQuestion = (i: number) => setQuestions((q) => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<PulseQuestion>) =>
    setQuestions((q) => q.map((qq, idx) => (idx === i ? { ...qq, ...patch } : qq)));

  const reset = () => {
    setTitle(""); setDescription(""); setAnonymous(true);
    setTone("neutral"); setKind("self"); setPeerAnonymous(true);
    setKudosCategories(["teamwork", "innovation", "delivery", "leadership", "customer"]);
    setKudosChannel(""); setPromptText("");
    setFrequency("once");
    setNextRunAt(toLocalInput(null));
    setTargetScope("team"); setTargetTeamId(""); setTargetPersonIds([]);
    setQuestions([{ position: 0, question_text: "", question_type: "scale_1_5", required: true }]);
  };


  const handleSubmit = async () => {
    if (!person?.id) return;
    if (!title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" }); return;
    }
    if (kind !== "kudos" && questions.some((q) => !q.question_text.trim())) {
      toast({ title: "Preencha todas as perguntas", variant: "destructive" }); return;
    }
    if (kind === "kudos" && kudosCategories.length === 0) {
      toast({ title: "Selecione ao menos uma categoria de kudos", variant: "destructive" }); return;
    }
    if (targetScope === "team" && !targetTeamId) {
      toast({ title: "Selecione um time", variant: "destructive" }); return;
    }
    if (targetScope === "custom" && targetPersonIds.length === 0) {
      toast({ title: "Selecione ao menos uma pessoa", variant: "destructive" }); return;
    }
    try {
      const commonKudos = {
        kudos_categories: kind === "kudos" ? kudosCategories : null,
        kudos_channel: kind === "kudos" ? (kudosChannel.trim() || null) : null,
        prompt_text: kind === "kudos" ? (promptText.trim() || null) : null,
      };
      if (isEdit && survey) {
        await updateMut.mutateAsync({
          id: survey.id,
          title: title.trim(),
          description: description.trim() || null,
          anonymous,
          tone,
          kind,
          peer_anonymous: peerAnonymous,
          ...commonKudos,
          frequency,
          next_run_at: new Date(nextRunAt).toISOString(),
          target_scope: targetScope,
          target_team_id: targetScope === "team" ? targetTeamId : null,
          target_person_ids: targetScope === "custom" ? targetPersonIds : null,
          questions: kind === "kudos" ? undefined : (hasResponses ? undefined : questions),
        } as any);
        toast({ title: "Enquete atualizada" });
      } else {
        await createMut.mutateAsync({
          created_by: person.id,
          title: title.trim(),
          description: description.trim() || undefined,
          anonymous,
          tone,
          kind,
          peer_anonymous: peerAnonymous,
          ...commonKudos,
          frequency,
          next_run_at: new Date(nextRunAt).toISOString(),
          target_scope: targetScope,
          target_team_id: targetScope === "team" ? targetTeamId : null,
          target_person_ids: targetScope === "custom" ? targetPersonIds : null,
          questions: kind === "kudos" ? [] : questions,
        } as any);

        toast({ title: "Enquete criada" });
      }
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  };

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar enquete" : "Nova enquete de pulse"}</DialogTitle>
          <DialogDescription>Configure perguntas, alvo e periodicidade.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Pulse Semanal" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {kind !== "kudos" ? (
              <div className="flex items-center justify-between rounded border p-3">
                <div>
                  <Label>Anônimo</Label>
                  <p className="text-xs text-muted-foreground">Oculta respondentes</p>
                </div>
                <Switch checked={anonymous} onCheckedChange={setAnonymous} />
              </div>
            ) : <div />}
            <div className="space-y-2">
              <Label>Frequência</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as PulseFrequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Única</SelectItem>
                  <SelectItem value="daily">Diária</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tom da mensagem</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="neutral">Neutro</SelectItem>
                  <SelectItem value="casual">Descontraído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Autoavaliação</SelectItem>
                  <SelectItem value="peer">Avaliação entre pares</SelectItem>
                  <SelectItem value="kudos">Kudos (reconhecimento)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "peer" && (
            <div className="flex items-center justify-between rounded border p-3 bg-muted/30">
              <div>
                <Label>Revisor anônimo</Label>
                <p className="text-xs text-muted-foreground">Se ativado, o avaliado não sabe quem o avaliou.</p>
              </div>
              <Switch checked={peerAnonymous} onCheckedChange={setPeerAnonymous} />
            </div>
          )}

          {kind === "kudos" && (
            <div className="space-y-3 rounded border p-3 bg-muted/30">
              <div>
                <Label>Categorias permitidas</Label>
                <p className="text-xs text-muted-foreground mb-2">Quais categorias o colaborador poderá escolher ao reconhecer um colega.</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "teamwork", label: "🤝 Trabalho em equipe" },
                    { id: "innovation", label: "💡 Inovação" },
                    { id: "delivery", label: "🚀 Entrega" },
                    { id: "leadership", label: "🏆 Liderança" },
                    { id: "customer", label: "❤️ Foco no cliente" },
                  ].map((c) => {
                    const active = kudosCategories.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setKudosCategories((cur) =>
                          active ? cur.filter((x) => x !== c.id) : [...cur, c.id]
                        )}
                        className={`px-3 py-1 rounded-full text-xs border transition ${
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Canal Slack para postagem (opcional)</Label>
                <Input
                  value={kudosChannel}
                  onChange={(e) => setKudosChannel(e.target.value)}
                  placeholder="#kudos"
                />
                <p className="text-xs text-muted-foreground">Se preenchido, cada kudo enviado a partir desta enquete também é postado nesse canal.</p>
              </div>
              <div className="space-y-2">
                <Label>Texto do prompt no Slack</Label>
                <Textarea
                  rows={2}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder={
                    tone === "formal" ? "Reconheça um colega que se destacou nesta semana." :
                    tone === "casual" ? "Bora reconhecer quem brilhou essa semana? 🌟" :
                    "Quem do time merece um kudo hoje?"
                  }
                />
              </div>
            </div>
          )}


          <div className="space-y-2">
            <Label>{isEdit ? "Próximo disparo" : "Primeiro disparo"}</Label>
            <Input type="datetime-local" value={nextRunAt} onChange={(e) => setNextRunAt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Alvo</Label>
            <Select value={targetScope} onValueChange={(v) => setTargetScope(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Time inteiro</SelectItem>
                <SelectItem value="custom">Pessoas específicas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetScope === "team" ? (
            <Select value={targetTeamId} onValueChange={setTargetTeamId}>
              <SelectTrigger><SelectValue placeholder="Selecione o time" /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={targetPersonIds.includes(p.id)}
                    onChange={(e) => setTargetPersonIds((cur) =>
                      e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)
                    )}
                  />
                  {p.nome} <span className="text-muted-foreground">({p.sub_time || "—"})</span>
                </label>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Perguntas</Label>
              {!hasResponses && (
                <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                  <Plus className="w-3 h-3 mr-1" /> Adicionar
                </Button>
              )}
            </div>
            {hasResponses && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Esta enquete já tem respostas. Perguntas não podem ser alteradas para preservar os dados.
              </p>
            )}
            {questions.map((q, i) => (
              <div key={i} className={`space-y-2 rounded border p-3 ${hasResponses ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">#{i + 1}</span>
                  <Select
                    value={q.question_type}
                    onValueChange={(v) => updateQuestion(i, { question_type: v as any })}
                    disabled={hasResponses}
                  >
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scale_1_5">Escala 1–5</SelectItem>
                      <SelectItem value="open_text">Texto aberto</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                      disabled={hasResponses}
                    />
                    Obrigatória
                  </label>
                  {!hasResponses && questions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(i)} className="ml-auto">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Pergunta"
                  rows={2}
                  value={q.question_text}
                  onChange={(e) => updateQuestion(i, { question_text: e.target.value })}
                  disabled={hasResponses}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar enquete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
