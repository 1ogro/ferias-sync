import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Users, FileText, UserPlus, Loader2, AlertTriangle } from "lucide-react";
import { Person } from "@/lib/types";

export interface DeletionImpact {
  subordinates: Array<{ id: string; nome: string; email: string }>;
  pending_requests: Array<{
    id: string;
    requester_nome: string;
    tipo: string;
    inicio: string | null;
    fim: string | null;
    status: string;
  }>;
  pending_people: Array<{ id: string; nome: string; email: string }>;
  counts: {
    subordinates: number;
    pending_requests: number;
    pending_people: number;
  };
}

interface ReassignManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Person | null;
  impact: DeletionImpact | null;
  candidates: Person[];
  onConfirm: (newManagerId: string, justification: string) => Promise<void>;
}

export function ReassignManagerDialog({
  open,
  onOpenChange,
  target,
  impact,
  candidates,
  onConfirm,
}: ReassignManagerDialogProps) {
  const [newManagerId, setNewManagerId] = useState<string>("");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewManagerId("");
      setJustification("");
      setSubmitting(false);
    }
  }, [open]);

  if (!target || !impact) return null;

  const handleConfirm = async () => {
    if (!newManagerId) return;
    setSubmitting(true);
    try {
      await onConfirm(newManagerId, justification.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const c = impact.counts;
  const total = c.subordinates + c.pending_requests + c.pending_people;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reatribuir equipe antes de excluir
          </DialogTitle>
          <DialogDescription>
            <strong>{target.nome}</strong> possui {total} item(ns) vinculado(s) que precisam ser
            reatribuídos a outro gestor antes da exclusão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {c.subordinates > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm hover:bg-muted">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Subordinados ativos
                  <Badge variant="secondary">{c.subordinates}</Badge>
                </span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 py-2 text-sm">
                <ul className="space-y-1">
                  {impact.subordinates.map((s) => (
                    <li key={s.id} className="text-muted-foreground">
                      • {s.nome} <span className="text-xs">({s.email})</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}

          {c.pending_requests > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm hover:bg-muted">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Solicitações pendentes
                  <Badge variant="secondary">{c.pending_requests}</Badge>
                </span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 py-2 text-sm">
                <ul className="space-y-1">
                  {impact.pending_requests.map((r) => (
                    <li key={r.id} className="text-muted-foreground">
                      • {r.requester_nome} — {r.tipo} ({r.inicio || "?"} a {r.fim || "?"}) —{" "}
                      <Badge variant="outline" className="text-xs">{r.status}</Badge>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}

          {c.pending_people > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm hover:bg-muted">
                <span className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Cadastros pendentes
                  <Badge variant="secondary">{c.pending_people}</Badge>
                </span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 py-2 text-sm">
                <ul className="space-y-1">
                  {impact.pending_people.map((p) => (
                    <li key={p.id} className="text-muted-foreground">
                      • {p.nome} <span className="text-xs">({p.email})</span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-manager">Novo gestor *</Label>
          <Select value={newManagerId} onValueChange={setNewManagerId}>
            <SelectTrigger id="new-manager">
              <SelectValue placeholder="Selecione o substituto..." />
            </SelectTrigger>
            <SelectContent>
              {candidates.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  Nenhum gestor/diretor disponível
                </div>
              ) : (
                candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} — {c.papel}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Apenas pessoas ativas com papel GESTOR ou DIRETOR.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="justification">Justificativa (opcional)</Label>
          <Textarea
            id="justification"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Motivo da exclusão e reatribuição..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!newManagerId || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              "Reatribuir e excluir"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
