import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface DeletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (justification?: string) => void;
  title: string;
  description: string;
  requireJustification: boolean;
  isAdminDeletion: boolean;
}

export function DeletionDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  requireJustification,
  isAdminDeletion
}: DeletionDialogProps) {
  const [justification, setJustification] = useState("");

  const handleConfirm = () => {
    if (requireJustification && !justification.trim()) {
      return;
    }
    onConfirm(justification);
    setJustification("");
  };

  const handleCancel = () => {
    onOpenChange(false);
    setJustification("");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left whitespace-pre-line">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireJustification && (
          <div className="space-y-2">
            <Label htmlFor="justification">
              Justificativa (Obrigatória) *
            </Label>
            <Textarea
              id="justification"
              placeholder="Informe a justificativa para esta exclusão administrativa..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Esta ação será registrada no histórico de auditoria.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={requireJustification && !justification.trim()}
          >
            {isAdminDeletion ? "Confirmar Exclusão Administrativa" : "Confirmar Exclusão"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
