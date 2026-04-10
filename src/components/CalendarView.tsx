import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TipoAusencia } from "@/lib/types";
import { parseDateSafely } from "@/lib/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

interface CalendarRequest {
  id: string;
  requester_id: string;
  inicio: string;
  fim: string;
  tipo: string;
  requester_name: string;
}

export const CalendarView = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [requests, setRequests] = useState<CalendarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user, currentDate]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
      const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('requests')
        .select(`
          id,
          requester_id,
          inicio,
          fim,
          tipo,
          people!requests_requester_id_fkey (nome)
        `)
        .in('status', ['APROVADO_FINAL', 'REALIZADO'])
        .lte('inicio', lastDay)
        .gte('fim', firstDay);

      if (error) throw error;

      setRequests(
        data?.map(r => ({
          id: r.id,
          requester_id: r.requester_id,
          inicio: r.inicio,
          fim: r.fim,
          tipo: r.tipo,
          requester_name: r.people?.nome || 'N/A',
        })) || []
      );
    } catch (error) {
      console.error('Erro ao carregar calendário:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getRequestsForDate = (date: Date) => {
    return requests.filter(req => {
      const requestStart = parseDateSafely(req.inicio);
      const requestEnd = parseDateSafely(req.fim);
      return date >= requestStart && date <= requestEnd;
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const monthYear = currentDate.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const days = getDaysInMonth(currentDate);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Calendário de Ausências
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium min-w-[160px] text-center capitalize">
              {monthYear}
            </span>
            <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {weekDays.map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) {
                  return <div key={index} className="p-2 h-20" />;
                }

                const dayRequests = getRequestsForDate(day);
                const isToday = day.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={day.toISOString()}
                    className={`p-2 h-20 border rounded-lg ${
                      isToday ? 'bg-primary/10 border-primary' : 'border-border'
                    } hover:bg-muted/50 transition-colors`}
                  >
                    <div className="text-sm font-medium mb-1">
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayRequests.slice(0, 2).map((request, reqIndex) => (
                        <Badge
                          key={reqIndex}
                          variant="outline"
                          className={`text-xs p-1 h-5 ${
                            request.tipo === TipoAusencia.FERIAS
                              ? 'bg-primary/10 text-primary'
                              : 'bg-status-in-review/10 text-status-in-review'
                          }`}
                        >
                          {request.requester_name.split(' ')[0]}
                        </Badge>
                      ))}
                      {dayRequests.length > 2 && (
                        <Badge variant="outline" className="text-xs p-1 h-5">
                          +{dayRequests.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-4 border-t text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary" />
                <span>Férias</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-status-in-review" />
                <span>Outras Ausências</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
