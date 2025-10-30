import { PendingPerson } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, XCircle, Calendar, Mail, Briefcase, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PendingCollaboratorCardProps {
  pending: PendingPerson;
  onApprove?: (pending: PendingPerson) => void;
  onReject?: (pending: PendingPerson) => void;
  showActions?: boolean;
}

const STATUS_CONFIG = {
  PENDENTE: {
    label: "Pendente",
    variant: "secondary" as const,
    icon: Clock,
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  },
  APROVADO: {
    label: "Aprovado",
    variant: "default" as const,
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-700 dark:text-green-400",
  },
  REJEITADO: {
    label: "Rejeitado",
    variant: "destructive" as const,
    icon: XCircle,
    className: "bg-red-500/10 text-red-700 dark:text-red-400",
  },
};

export function PendingCollaboratorCard({ pending, onApprove, onReject, showActions }: PendingCollaboratorCardProps) {
  const statusConfig = STATUS_CONFIG[pending.status];
  const StatusIcon = statusConfig.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{pending.nome}</CardTitle>
            <p className="text-sm text-muted-foreground">{pending.cargo}</p>
          </div>
          <Badge className={statusConfig.className}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{pending.email}</span>
          </div>

          {pending.sub_time && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>Time: {pending.sub_time}</span>
            </div>
          )}

          {pending.local && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{pending.local}</span>
            </div>
          )}

          {pending.gestor?.nome && (
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>Gestor: {pending.gestor.nome}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Cadastrado em {format(new Date(pending.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
          </div>
        </div>

        {pending.rejection_reason && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">Motivo da Rejeição:</p>
            <p className="mt-1 text-muted-foreground">{pending.rejection_reason}</p>
          </div>
        )}

        {pending.director_notes && pending.status === "APROVADO" && (
          <div className="rounded-md bg-primary/10 p-3 text-sm">
            <p className="font-medium">Observações do Diretor:</p>
            <p className="mt-1 text-muted-foreground">{pending.director_notes}</p>
          </div>
        )}

        {showActions && pending.status === "PENDENTE" && (
          <div className="flex gap-2 pt-2">
            <Button variant="default" size="sm" onClick={() => onApprove?.(pending)} className="flex-1">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Aprovar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onReject?.(pending)} className="flex-1">
              <XCircle className="mr-2 h-4 w-4" />
              Rejeitar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
