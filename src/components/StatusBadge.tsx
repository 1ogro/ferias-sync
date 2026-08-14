import { Badge } from "@/components/ui/badge";
import { Status, STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: Status;
  className?: string;
  /** Quando a instância final é o gerente do time, exibe rótulo específico */
  finalApproverIsGerente?: boolean;
}

export const StatusBadge = ({ status, className, finalApproverIsGerente }: StatusBadgeProps) => {
  const getStatusStyle = (status: Status) => {
    switch (status) {
      case Status.PENDENTE:
        return "bg-status-pending/10 text-status-pending border-status-pending/20";
      case Status.EM_ANALISE_GESTOR:
      case Status.EM_ANALISE_DIRETOR:
        return "bg-status-in-review/10 text-status-in-review border-status-in-review/20";
      case Status.APROVADO_1NIVEL:
      case Status.APROVADO_FINAL:
      case Status.REALIZADO:
        return "bg-status-approved/10 text-status-approved border-status-approved/20";
      case Status.REPROVADO:
      case Status.CANCELADO:
        return "bg-status-rejected/10 text-status-rejected border-status-rejected/20";
      case Status.RASCUNHO:
        return "bg-muted text-muted-foreground border-muted/40";
      default:
        return "bg-muted text-muted-foreground border-muted";
    }
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(getStatusStyle(status), className)}
    >
      {status === Status.EM_ANALISE_DIRETOR && finalApproverIsGerente
        ? 'Em Análise - Gerente'
        : STATUS_LABELS[status]}
    </Badge>
  );
};