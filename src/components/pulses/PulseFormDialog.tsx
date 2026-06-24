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
import { useCreatePulseSurvey, PulseQuestion, PulseFrequency } from "@/hooks/usePulses";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PulseFormDialog({ open, onOpenChange }: Props) {
  const { person } = useAuth();
  const { toast } = useToast();
  const createMut = useCreatePulseSurvey();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [frequency, setFrequency] = useState<PulseFrequency>("once");
  const [nextRunAt, setNextRunAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d.toISOString().slice(0, 16);
  });
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
      if (!isDirectorOrAdmin && person?.sub_time) {
        q = q.eq("sub_time", person.sub_time);
      }
      const { data } = await q.order("nome");
      const list = (data || []) as any[];
      setPeople(list);
      setTeams([...new Set(list.map((p) => p.sub_time).filter(Boolean))] as string[]);
      if (!isDirectorOrAdmin && person?.sub_time) setTargetTeamId(person.sub_time);
    })();
  }, [open, isDirectorOrAdmin, person?.sub_time]);

  const addQuestion = () =>
    setQuestions((q) => [...q, { position: q.length, question_text: "", question_type: "scale_1_5", required: true }]);
  const removeQuestion = (i: number) => setQuestions((q) => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<PulseQuestion>) =>
    setQuestions((q) => q.map((qq, idx) => (idx === i ? { ...qq, ...patch } : qq)));

  const reset = () => {
    setTitle(""); setDescription(""); setAnonymous(true); setFrequency("once");
    setTargetScope("team"); setTargetTeamId(""); setTargetPersonIds([]);
    setQuestions([{ position: 0, question_text: "", question_type: "scale_1_5", required: true }]);
  };

  const handleSubmit = async () => {
    if (!person?.id) return;
    if (!title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" }); return;
    }
    if (questions.some((q) => !q.question_text.trim())) {
      toast({ title: "Preencha todas as perguntas", variant: "destructive" }); return;
    }
    if (targetScope === "team" && !targetTeamId) {
      toast({ title: "Selecione um time", variant: "destructive" }); return;
    }
    if (targetScope === "custom" && targetPersonIds.length === 0) {
      toast({ title: "Selecione ao menos uma pessoa", variant: "destructive" }); return;
    }
    try {
      await createMut.mutateAsync({
        created_by: person.id,
        title: title.trim(),
        description: description.trim() || undefined,
        anonymous,
        frequency,
        next_run_at: new Date(nextRunAt).toISOString(),
        target_scope: targetScope,
        target_team_id: targetScope === "team" ? targetTeamId : null,
        target_person_ids: targetScope === "custom" ? targetPersonIds : null,
        questions,
      });
      toast({ title: "Enquete criada" });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao criar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova enquete de pulse</DialogTitle>
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
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label>Anônimo</Label>
                <p className="text-xs text-muted-foreground">Oculta respondentes</p>
              </div>
              <Switch checked={anonymous} onCheckedChange={setAnonymous} />
            </div>
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

          <div className="space-y-2">
            <Label>Primeiro disparo</Label>
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
              <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                <Plus className="w-3 h-3 mr-1" /> Adicionar
              </Button>
            </div>
            {questions.map((q, i) => (
              <div key={i} className="space-y-2 rounded border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">#{i + 1}</span>
                  <Select value={q.question_type} onValueChange={(v) => updateQuestion(i, { question_type: v as any })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scale_1_5">Escala 1–5</SelectItem>
                      <SelectItem value="open_text">Texto aberto</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} />
                    Obrigatória
                  </label>
                  {questions.length > 1 && (
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
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? "Criando..." : "Criar enquete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
