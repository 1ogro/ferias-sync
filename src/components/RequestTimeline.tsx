import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./StatusBadge";
import { Status } from "@/lib/types";
import { Clock, CheckCircle, XCircle, User, Calendar } from "lucide-react";

interface TimelineEvent {
  id: string;
  status: Status;
  actor: string;
  date: Date;
  comment?: string;
}

interface RequestTimelineProps {
  events: TimelineEvent[];
}

export const RequestTimeline = ({ events }: RequestTimelineProps) => {
  const getIcon = (status: Status) => {
    switch (status) {
      case Status.PENDENTE:
        return <Clock className="w-4 h-4" />;
      case Status.APROVADO_1NIVEL:
      case Status.APROVADO_FINAL:
        return <CheckCircle className="w-4 h-4 text-status-approved" />;
      case Status.REPROVADO:
      case Status.CANCELADO:
        return <XCircle className="w-4 h-4 text-status-rejected" />;
      case Status.RASCUNHO:
        return <User className="w-4 h-4 text-muted-foreground" />;
      default:
        return <User className="w-4 h-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Timeline da Solicitação
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={event.id} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="p-2 rounded-full bg-muted">
                  {getIcon(event.status)}
                </div>
                {index < events.length - 1 && (
                  <div className="w-px h-8 bg-border mt-2" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={event.status} />
                  <span className="text-sm text-muted-foreground">
                    por {event.actor}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {event.date.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long", 
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
                {event.comment && (
                  <p className="text-sm bg-muted p-3 rounded-lg mt-2">
                    {event.comment}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};