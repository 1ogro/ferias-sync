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
  CreateSurveyInput,
} from "@/hooks/usePulses";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  survey?: PulseSurvey | null;
  initialValues?: Partial<CreateSurveyInput> | null;
}

function toLocalInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 30 * 60_000);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

export function PulseFormDialog({ open, onOpenChange, survey, initialValues }: Props) {
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
  const [peerPairingStrategy, setPeerPairingStrategy] = useState<"round_robin" | "random" | "fixed">("round_robin");
  const [peerFixedPairs, setPeerFixedPairs] = useState<{ reviewer_id: string; subject_id: string }[]>([]);
  const [peerReviewsPerReviewer, setPeerReviewsPerReviewer] = useState<number>(1);
  const [kudosCategories, setKudosCategories] = useState<string[]>([
    "teamwork", "innovation", "delivery", "leadership", "customer",
  ]);
  const [kudosChannel, setKudosChannel] = useState<string>("");
  const [promptText, setPromptText] = useState<string>("");
  const [frequency, setFrequency] = useState<PulseFrequency>("once");
  const [nextRunAt, setNextRunAt] = useState<string>(() => toLocalInput(null));
  const [targetScope, setTargetScope] = useState<"all" | "teams" | "custom">("all");
  const [targetTeamIds, setTargetTeamIds] = useState<string[]>([]);
  const [targetPersonIds, setTargetPersonIds] = useState<string[]>([]);
  const [notifyNegative, setNotifyNegative] = useState(false);
  const [notifyPositive, setNotifyPositive] = useState(false);
  const [negThreshold, setNegThreshold] = useState(2);
  const [posThreshold, setPosThreshold] = useState(4);
  const [notifyIncludeText, setNotifyIncludeText] = useState(false);
  const [responseDeadlineHours, setResponseDeadlineHours] = useState<number>(0);
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(true);
  const [reminderOffsetsText, setReminderOffsetsText] = useState<string>("24, 2");
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
      if (!isEdit && !isDirectorOrAdmin && person?.subTime) {
        setTargetScope("teams");
        setTargetTeamIds([person.subTime]);
      }
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
      setPeerPairingStrategy(((survey as any).peer_pairing_strategy as any) ?? "round_robin");
      setPeerFixedPairs(((survey as any).peer_fixed_pairs as any) ?? []);
      setKudosCategories(((survey as any).kudos_categories as string[] | null) ?? [
        "teamwork", "innovation", "delivery", "leadership", "customer",
      ]);
      setKudosChannel((survey as any).kudos_channel || "");
      setPromptText((survey as any).prompt_text || "");

      setFrequency(survey.frequency);
      setNextRunAt(toLocalInput(survey.next_run_at));
      setTargetScope(survey.target_scope as any);
      setTargetTeamIds(
        (survey as any).target_team_ids ??
          (survey.target_team_id ? [survey.target_team_id] : [])
      );
      setTargetPersonIds(survey.target_person_ids || []);
      setNotifyNegative(!!(survey as any).notify_manager_on_negative);
      setNotifyPositive(!!(survey as any).notify_manager_on_positive);
      setNegThreshold((survey as any).notify_negative_threshold ?? 2);
      setPosThreshold((survey as any).notify_positive_threshold ?? 4);
      setNotifyIncludeText(!!(survey as any).notify_include_text_responses);
      setResponseDeadlineHours((survey as any).response_deadline_hours ?? 0);
      setReminderEnabled((survey as any).reminder_enabled ?? true);
      setReminderOffsetsText((((survey as any).reminder_offsets_hours as number[]) ?? [24, 2]).join(", "));
    } else if (!isEdit) {
      reset();
      if (initialValues) {
        if (initialValues.title !== undefined) setTitle(initialValues.title);
        if (initialValues.description !== undefined) setDescription(initialValues.description || "");
        if (initialValues.anonymous !== undefined) setAnonymous(initialValues.anonymous);
        if (initialValues.tone) setTone(initialValues.tone);
        if (initialValues.kind) setKind(initialValues.kind);
        if (initialValues.peer_anonymous !== undefined) setPeerAnonymous(initialValues.peer_anonymous);
        if (initialValues.kudos_categories) setKudosCategories(initialValues.kudos_categories as string[]);
        if (initialValues.kudos_channel !== undefined) setKudosChannel(initialValues.kudos_channel || "");
        if (initialValues.prompt_text !== undefined) setPromptText(initialValues.prompt_text || "");
        if (initialValues.frequency) setFrequency(initialValues.frequency);
        if (initialValues.target_scope) setTargetScope(initialValues.target_scope);
        if (initialValues.target_team_ids) setTargetTeamIds(initialValues.target_team_ids as string[]);
        else if (initialValues.target_team_id) setTargetTeamIds([initialValues.target_team_id]);
        if (initialValues.target_person_ids) setTargetPersonIds(initialValues.target_person_ids);
        if (initialValues.questions && initialValues.questions.length) setQuestions(initialValues.questions);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, survey?.id, initialValues]);

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
    setPeerPairingStrategy("round_robin"); setPeerFixedPairs([]);
    setKudosCategories(["teamwork", "innovation", "delivery", "leadership", "customer"]);
    setKudosChannel(""); setPromptText("");
    setFrequency("once");
    setNextRunAt(toLocalInput(null));
    setTargetScope("all"); setTargetTeamIds([]); setTargetPersonIds([]);
    setNotifyNegative(false); setNotifyPositive(false);
    setNegThreshold(2); setPosThreshold(4); setNotifyIncludeText(false);
    setResponseDeadlineHours(0); setReminderEnabled(true); setReminderOffsetsText("24, 2");
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
    if (targetScope === "teams" && targetTeamIds.length === 0) {
      toast({ title: "Selecione ao menos um time", variant: "destructive" }); return;
    }
    if (targetScope === "custom" && targetPersonIds.length === 0) {
      toast({ title: "Selecione ao menos uma pessoa", variant: "destructive" }); return;
    }
    if (kind === "peer" && peerPairingStrategy === "fixed") {
      const validPairs = peerFixedPairs.filter((p) => p.reviewer_id && p.subject_id && p.reviewer_id !== p.subject_id);
      if (validPairs.length === 0) {
        toast({ title: "Defina ao menos um par (avaliador → avaliado)", variant: "destructive" }); return;
      }
      const reviewers = validPairs.map((p) => p.reviewer_id);
      if (new Set(reviewers).size !== reviewers.length) {
        toast({ title: "Cada avaliador só pode aparecer uma vez", variant: "destructive" }); return;
      }
    }
    try {
      const commonKudos = {
        kudos_categories: kind === "kudos" ? kudosCategories : null,
        kudos_channel: kind === "kudos" ? (kudosChannel.trim() || null) : null,
        prompt_text: kind === "kudos" ? (promptText.trim() || null) : null,
      };
      const peerFields = {
        peer_pairing_strategy: kind === "peer" ? peerPairingStrategy : "round_robin",
        peer_fixed_pairs: kind === "peer" && peerPairingStrategy === "fixed"
          ? peerFixedPairs.filter((p) => p.reviewer_id && p.subject_id && p.reviewer_id !== p.subject_id)
          : null,
      };
      const notifyFields = {
        notify_manager_on_negative: kind === "kudos" ? false : notifyNegative,
        notify_manager_on_positive: kind === "kudos" ? false : notifyPositive,
        notify_negative_threshold: Math.min(5, Math.max(1, negThreshold || 2)),
        notify_positive_threshold: Math.min(5, Math.max(1, posThreshold || 4)),
        notify_include_text_responses: kind === "kudos" ? false : notifyIncludeText,
      };
      const parsedOffsets = reminderOffsetsText
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0)
        .slice(0, 5);
      const reminderFields = {
        response_deadline_hours: kind === "kudos" ? null : (responseDeadlineHours > 0 ? responseDeadlineHours : null),
        reminder_enabled: kind === "kudos" ? false : (responseDeadlineHours > 0 && reminderEnabled),
        reminder_offsets_hours: parsedOffsets.length ? parsedOffsets : [24, 2],
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
          ...peerFields,
          ...notifyFields,
          ...reminderFields,
          frequency,
          next_run_at: new Date(nextRunAt).toISOString(),
          target_scope: targetScope,
          target_team_id: null,
          target_team_ids: targetScope === "teams" ? targetTeamIds : null,
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
          ...peerFields,
          ...notifyFields,
          ...reminderFields,
          frequency,
          next_run_at: new Date(nextRunAt).toISOString(),
          target_scope: targetScope,
          target_team_id: null,
          target_team_ids: targetScope === "teams" ? targetTeamIds : null,
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
            <div className="space-y-3 rounded border p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Revisor anônimo</Label>
                  <p className="text-xs text-muted-foreground">Se ativado, o avaliado não sabe quem o avaliou.</p>
                </div>
                <Switch checked={peerAnonymous} onCheckedChange={setPeerAnonymous} />
              </div>

              <div className="space-y-2">
                <Label>Estratégia de pareamento</Label>
                <Select value={peerPairingStrategy} onValueChange={(v) => setPeerPairingStrategy(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">Round-robin (por time)</SelectItem>
                    <SelectItem value="random">Aleatório (por time)</SelectItem>
                    <SelectItem value="fixed">Pareamento fixo (manual)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {peerPairingStrategy === "round_robin" && "Cada pessoa avalia a próxima da lista embaralhada, dentro do mesmo time."}
                  {peerPairingStrategy === "random" && "Cada pessoa recebe um avaliado sorteado aleatoriamente dentro do mesmo time."}
                  {peerPairingStrategy === "fixed" && "Você define manualmente quem avalia quem. Os pares se repetem em cada rodada."}
                </p>
              </div>

              {peerPairingStrategy === "fixed" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Pares fixos</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPeerFixedPairs((cur) => [...cur, { reviewer_id: "", subject_id: "" }])}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Adicionar par
                    </Button>
                  </div>
                  {peerFixedPairs.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum par definido ainda.</p>
                  )}
                  {peerFixedPairs.map((pair, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        value={pair.reviewer_id}
                        onValueChange={(v) =>
                          setPeerFixedPairs((cur) => cur.map((p, i) => (i === idx ? { ...p, reviewer_id: v } : p)))
                        }
                      >
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Avaliador" /></SelectTrigger>
                        <SelectContent>
                          {people.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">→</span>
                      <Select
                        value={pair.subject_id}
                        onValueChange={(v) =>
                          setPeerFixedPairs((cur) => cur.map((p, i) => (i === idx ? { ...p, subject_id: v } : p)))
                        }
                      >
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Avaliado" /></SelectTrigger>
                        <SelectContent>
                          {people.filter((p) => p.id !== pair.reviewer_id).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPeerFixedPairs((cur) => cur.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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


          {kind !== "kudos" && (
            <div className="space-y-3 rounded border p-3">
              <div>
                <Label className="text-sm font-semibold">Prazo e lembretes</Label>
                <p className="text-xs text-muted-foreground">
                  Defina o prazo (em horas) e receba lembretes automáticos no Slack para quem ainda não respondeu.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prazo para resposta (horas)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={responseDeadlineHours}
                    onChange={(e) => setResponseDeadlineHours(parseInt(e.target.value || "0", 10))}
                    placeholder="0 = sem prazo"
                  />
                  <p className="text-[11px] text-muted-foreground">0 desativa os lembretes.</p>
                </div>
                <div className="flex items-center justify-between rounded border p-2">
                  <div>
                    <Label className="text-xs">Lembretes automáticos</Label>
                    <p className="text-[11px] text-muted-foreground">Enviar via Slack</p>
                  </div>
                  <Switch
                    checked={reminderEnabled}
                    disabled={responseDeadlineHours <= 0}
                    onCheckedChange={setReminderEnabled}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Horas antes do prazo (separadas por vírgula)</Label>
                <Input
                  value={reminderOffsetsText}
                  onChange={(e) => setReminderOffsetsText(e.target.value)}
                  disabled={responseDeadlineHours <= 0 || !reminderEnabled}
                  placeholder="24, 2"
                />
                <p className="text-[11px] text-muted-foreground">
                  Use 0 para lembrete no vencimento. Até 5 offsets.
                </p>
              </div>
            </div>
          )}


          {kind !== "kudos" && (
            <div className="space-y-3 rounded border p-3">
              <div>
                <Label className="text-sm font-semibold">Notificações ao gestor</Label>
                <p className="text-xs text-muted-foreground">
                  Avisa o gestor direto do respondente quando uma resposta cai na faixa configurada.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <Label className="text-sm">Notificar em respostas negativas</Label>
                  <p className="text-xs text-muted-foreground">Dispara quando a nota for menor ou igual ao limite.</p>
                </div>
                <Switch checked={notifyNegative} onCheckedChange={setNotifyNegative} />
                <Input
                  type="number"
                  min={1}
                  max={5}
                  className="w-16"
                  value={negThreshold}
                  onChange={(e) => setNegThreshold(parseInt(e.target.value, 10) || 1)}
                  disabled={!notifyNegative}
                />
              </div>
              {notifyNegative && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
                  <input
                    type="checkbox"
                    checked={notifyIncludeText}
                    onChange={(e) => setNotifyIncludeText(e.target.checked)}
                  />
                  Incluir respostas em texto livre como feedback negativo
                </label>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <Label className="text-sm">Notificar em respostas positivas</Label>
                  <p className="text-xs text-muted-foreground">Dispara quando a nota for maior ou igual ao limite.</p>
                </div>
                <Switch checked={notifyPositive} onCheckedChange={setNotifyPositive} />
                <Input
                  type="number"
                  min={1}
                  max={5}
                  className="w-16"
                  value={posThreshold}
                  onChange={(e) => setPosThreshold(parseInt(e.target.value, 10) || 5)}
                  disabled={!notifyPositive}
                />
              </div>
              {anonymous && (notifyNegative || notifyPositive) && (
                <p className="text-xs text-muted-foreground">
                  ℹ️ A enquete é anônima — o gestor receberá o alerta sem o nome do respondente.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{isEdit ? "Próximo disparo" : "Primeiro disparo"}</Label>
            <Input type="datetime-local" value={nextRunAt} onChange={(e) => setNextRunAt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Público-alvo</Label>
            <Select value={targetScope} onValueChange={(v) => setTargetScope(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Empresa inteira</SelectItem>
                <SelectItem value="teams">Time(s) específico(s)</SelectItem>
                <SelectItem value="custom">Pessoas específicas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetScope === "all" && (
            <p className="text-xs text-muted-foreground">
              Será disparado para todos os colaboradores ativos do sistema ({people.length}).
            </p>
          )}

          {targetScope === "teams" && (
            <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
              {teams.length === 0 && (
                <p className="text-xs text-muted-foreground p-2">Nenhum time disponível.</p>
              )}
              {teams.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={targetTeamIds.includes(t)}
                    onChange={(e) => setTargetTeamIds((cur) =>
                      e.target.checked ? [...cur, t] : cur.filter((x) => x !== t)
                    )}
                  />
                  {t}
                </label>
              ))}
            </div>
          )}

          {targetScope === "custom" && (
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


          {kind !== "kudos" && (
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
          )}
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
