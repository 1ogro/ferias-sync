import { Request, TIPO_LABELS, Status } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { Calendar, AlertTriangle, Edit, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RequestCardProps {
  request: Request;
  onEdit?: (request: Request) => void;
  onView?: (request: Request) => void;
  onDelete?: (request: Request) => void;
  showActions?: boolean;
}

export const RequestCard = ({ 
  request, 
  onEdit, 
  onView,
  onDelete,
  showActions = true 
}: RequestCardProps) => {
  const formatDate = (date: Date | null) => {
    if (!date) return "Não definida";
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  };

  const getDuration = () => {
    if (!request.inicio || !request.fim) return "Não definido";
    const diffTime = Math.abs(request.fim.getTime() - request.inicio.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} dia${diffDays > 1 ? 's' : ''}`;
  };

  // Check if request is retroactive (start date is in the past)
  const isRetroactive = () => {
    if (!request.inicio) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return request.inicio < today;
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200 border-l-4 border-l-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{TIPO_LABELS[request.tipo]}</Badge>
              <StatusBadge status={request.status} />
              {request.isHistorical && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Histórica
                </Badge>
              )}
              {isRetroactive() && (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30">
                  Retroativo
                </Badge>
              )}
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
              {request.status === Status.RASCUNHO && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete?.(request)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
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
              {request.inicio && request.fim && request.inicio.getTime() !== request.fim.getTime() && 
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