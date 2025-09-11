import { Request, TIPO_LABELS } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { Calendar, AlertTriangle, Edit, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RequestCardProps {
  request: Request;
  onEdit?: (request: Request) => void;
  onView?: (request: Request) => void;
  showActions?: boolean;
}

export const RequestCard = ({ 
  request, 
  onEdit, 
  onView,
  showActions = true 
}: RequestCardProps) => {
  const formatDate = (date: Date) => {
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  };

  const getDuration = () => {
    const diffTime = Math.abs(request.fim.getTime() - request.inicio.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} dia${diffDays > 1 ? 's' : ''}`;
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200 border-l-4 border-l-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{TIPO_LABELS[request.tipo]}</Badge>
              <StatusBadge status={request.status} />
              {request.conflitoFlag && (
                <Badge variant="outline" className="bg-status-rejected/10 text-status-rejected border-status-rejected/20">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Conflito
                </Badge>
              )}
            </div>
            <h4 className="font-medium">{request.requester.nome}</h4>
          </div>
          {showActions && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onView?.(request)}
                className="h-8 w-8 p-0"
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost" 
                size="sm"
                onClick={() => onEdit?.(request)}
                className="h-8 w-8 p-0"
              >
                <Edit className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>
              {formatDate(request.inicio)} 
              {request.inicio.getTime() !== request.fim.getTime() && 
                ` - ${formatDate(request.fim)}`
              }
            </span>
          </div>
          <span className="text-xs bg-muted px-2 py-1 rounded">
            {getDuration()}
          </span>
        </div>
        {request.justificativa && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {request.justificativa}
          </p>
        )}
      </CardContent>
    </Card>
  );
};