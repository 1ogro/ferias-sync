import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  onRequested?: () => void;
}

export function FeedbackReminderOptOutDialog({ open, onOpenChange, personId, onRequested }: Props) {
  const { toast } = useToast();
  const [slack, setSlack] = useState(true);
  const [email, setEmail] = useState(true);
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = (slack || email) && justification.trim().length >= 5;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const changes: Record<string, boolean> = {};
      if (slack) changes.feedback_reminders_slack = false;
      if (email) changes.feedback_reminders_email = false;

      const { data, error } = await (supabase as any).rpc("request_data_change", {
        p_person_id: personId,
        p_changes: changes,
        p_justification: justification.trim(),
        p_kind: "FEEDBACK_REMINDER_OPTOUT",
      });
      if (error) throw error;
      const result = data as { success: boolean; message?: string };
      if (!result?.success) throw new Error(result?.message || "Falha ao enviar solicitação");

      toast({ title: "Solicitação enviada", description: "Seu gerente ou a diretoria vai avaliar o pedido." });
      setJustification("");
      onOpenChange(false);
      onRequested?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar desligamento da cobrança</DialogTitle>
          <DialogDescription>
            Como você tem liderados, o desligamento precisa ser aprovado pelo seu gerente, pela diretoria ou por um admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Canais que deseja desligar</Label>
            <div className="flex items-center gap-2">
              <Checkbox id="optout-slack" checked={slack} onCheckedChange={(v) => setSlack(v === true)} />
              <Label htmlFor="optout-slack" className="font-normal">Slack</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="optout-email" checked={email} onCheckedChange={(v) => setEmail(v === true)} />
              <Label htmlFor="optout-email" className="font-normal">E-mail</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="optout-justification">Justificativa (obrigatória)</Label>
            <Textarea
              id="optout-justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explique por que a cobrança deve ser desligada"
              className="min-h-[80px]"
            />
            {justification.trim().length > 0 && justification.trim().length < 5 && (
              <p className="text-xs text-destructive">Escreva ao menos 5 caracteres.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Enviando..." : "Enviar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
