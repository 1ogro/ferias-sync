import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatDateSafe } from "@/lib/dateUtils";
import type { OverlappingRequest } from "@/lib/requestOverlap";

const TIPO_LABEL: Record<string, string> = {
  FERIAS: "Férias",
  DAYOFF: "Day-off",
  DAY_OFF: "Day-off",
  LICENCA_MEDICA: "Licença médica",
  LICENCA_MATERNIDADE: "Licença maternidade",
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANALISE_GESTOR: "Em análise do gestor",
  APROVADO_1NIVEL: "Aprovada pelo gestor",
  EM_ANALISE_DIRETOR: "Em análise final",
  INFORMACOES_ADICIONAIS: "Aguardando suas informações",
  APROVADO_FINAL: "Aprovada",
};

interface Props {
  open: boolean;
  overlaps: OverlappingRequest[];
  onOpenChange: (open: boolean) => void;
  /** Continue sending, cancelling the listed requests. */
  onReplace: () => void;
  /** Go back to edit the existing request instead. */
  onEditExisting: (requestId: string) => void;
  submitting?: boolean;
}

export const OverlappingRequestsDialog = ({
  open,
  overlaps,
  onOpenChange,
  onReplace,
  onEditExisting,
  submitting,
}: Props) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Você já tem solicitação para este período
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                Enviar uma nova solicitação sobreposta cria pedidos duplicados para a liderança.
                Prefira editar a existente.
              </p>
              <ul className="space-y-2">
                {overlaps.map((r) => (
                  <li key={r.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {TIPO_LABEL[r.tipo] || r.tipo}
                      </span>
                      <Badge variant="outline">{STATUS_LABEL[r.status] || r.status}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {r.inicio ? formatDateSafe(r.inicio) : "—"}
                      {r.fim && r.fim !== r.inicio ? ` a ${formatDateSafe(r.fim)}` : ""}
                    </p>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() => onEditExisting(r.id)}
                    >
                      Editar esta solicitação
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onReplace} disabled={submitting}>
            {submitting ? "Enviando..." : "Substituir a anterior"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
