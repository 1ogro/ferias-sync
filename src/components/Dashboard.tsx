import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestCard } from "./RequestCard";
import { VacationBalance } from "./VacationBalance";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Status, TipoAusencia, Request } from "@/lib/types";
import { 
  Calendar, 
  Plus, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Users,
  CalendarDays
} from "lucide-react";
import React from "react";
import { useBirthdayNotifications } from "@/hooks/useBirthdayNotifications";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { person } = useAuth();
  const [selectedTab, setSelectedTab] = useState<"overview" | "requests">("overview");
  const [userRequests, setUserRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Initialize birthday notifications for managers
  useBirthdayNotifications();

  useEffect(() => {
    if (person) {
      fetchUserRequests();
    }
  }, [person]);

  const fetchUserRequests = async () => {
    if (!person) return;
    
    try {
      const { data } = await supabase
        .from('requests')
        .select(`
          *,
          people!inner(*)
        `)
        .eq('requester_id', person.id)
        .order('created_at', { ascending: false });

      if (data) {
        const formattedRequests: Request[] = data.map(req => ({
          id: req.id,
          requesterId: req.requester_id,
          requester: req.people as any,
          tipo: req.tipo as TipoAusencia,
          inicio: new Date(req.inicio),
          fim: new Date(req.fim),
          tipoFerias: req.tipo_ferias,
          status: req.status as Status,
          justificativa: req.justificativa,
          conflitoFlag: req.conflito_flag,
          conflitoRefs: req.conflito_refs,
          createdAt: new Date(req.created_at),
          updatedAt: new Date(req.updated_at)
        }));
        setUserRequests(formattedRequests);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const pendingRequests = userRequests.filter(req => 
    [Status.PENDENTE, Status.EM_ANALISE_GESTOR, Status.EM_ANALISE_DIRETOR].includes(req.status)
  );
  const approvedRequests = userRequests.filter(req => 
    [Status.APROVADO_FINAL, Status.REALIZADO].includes(req.status)
  );

  // Calculate day-offs with birthdate validation
  const dayOffInfo = React.useMemo(() => {
    if (!person?.data_nascimento) {
      return {
        available: 0,
        canRequest: false,
        message: "É necessário cadastrar sua data de nascimento no perfil, para poder solicitar um Day-off",
        disabled: true
      };
    }

    const currentYear = new Date().getFullYear();
    const hasUsedThisYear = userRequests.some(request => 
      request.tipo === TipoAusencia.DAYOFF &&
      [Status.APROVADO_FINAL, Status.REALIZADO].includes(request.status) &&
      request.inicio.getFullYear() === currentYear
    );

    return {
      available: hasUsedThisYear ? 0 : 1,
      canRequest: !hasUsedThisYear,
      message: hasUsedThisYear 
        ? `Day-off já utilizado este ano. Próximo reset: 01/01/${currentYear + 1}`
        : "1 Day-off disponível para o seu aniversário",
      disabled: false
    };
  }, [person, userRequests]);

  const stats = [
    {
      title: "Solicitações Pendentes", 
      value: pendingRequests.length,
      icon: Clock,
      color: "text-status-pending",
      bgColor: "bg-status-pending/10"
    },
    {
      title: "Aprovadas este Ano",
      value: approvedRequests.length, 
      icon: CheckCircle,
      color: "text-status-approved",
      bgColor: "bg-status-approved/10"
    },
    {
      title: "Days Off Disponíveis", 
      value: dayOffInfo.disabled ? "—" : dayOffInfo.available,
      icon: Calendar,
      color: dayOffInfo.disabled ? "text-muted-foreground" : "text-status-in-review",
      bgColor: dayOffInfo.disabled ? "bg-muted/20" : "bg-status-in-review/10",
      disabled: dayOffInfo.disabled,
      message: dayOffInfo.message
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-2">
              Olá, {person?.nome.split(" ")[0] || 'Usuário'}! 👋
            </h2>
            <p className="text-muted-foreground">
              Gerencie suas férias e days off de forma simples e eficiente.
            </p>
          </div>
          <Button className="bg-primary hover:bg-primary/90" onClick={() => navigate('/new-request')}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Solicitação
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className={`hover:shadow-md transition-shadow ${stat.disabled ? 'opacity-60' : ''}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  {stat.disabled ? (
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {stat.message}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl font-bold mt-2">
                        {stat.value}
                      </p>
                      {stat.message && stat.title === "Days Off Disponíveis" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {stat.message}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vacation Balance */}
      <div className="mb-6">
        <VacationBalance />
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg">
        <Button
          variant={selectedTab === "overview" ? "default" : "ghost"}
          onClick={() => setSelectedTab("overview")}
          className="flex-1"
        >
          Visão Geral
        </Button>
        <Button
          variant={selectedTab === "requests" ? "default" : "ghost"}
          onClick={() => setSelectedTab("requests")}
          className="flex-1"
        >
          Minhas Solicitações
        </Button>
      </div>

      {/* Content */}
      {selectedTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Atividade Recente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p>Carregando...</p>
              ) : userRequests.length > 0 ? (
                userRequests.slice(0, 3).map((request) => (
                  <div key={request.id} onClick={() => navigate(`/requests/${request.id}`)} className="cursor-pointer">
                    <RequestCard 
                      request={request} 
                      showActions={false}
                    />
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Nenhuma solicitação encontrada.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Calendar Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Próximos Períodos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loading ? (
                  <p>Carregando...</p>
                ) : approvedRequests.length > 0 ? (
                  approvedRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-8 rounded-full ${
                          request.tipo === TipoAusencia.FERIAS ? "bg-primary" : "bg-status-in-review"
                        }`} />
                        <div>
                          <p className="font-medium">{request.tipo === TipoAusencia.FERIAS ? "Férias" : "Day Off"}</p>
                          <p className="text-sm text-muted-foreground">
                            {request.inicio.toLocaleDateString("pt-BR")}
                            {request.inicio.getTime() !== request.fim.getTime() && 
                              ` - ${request.fim.toLocaleDateString("pt-BR")}`
                            }
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-status-approved/10 text-status-approved">
                        Aprovado
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhum período aprovado encontrado.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedTab === "requests" && (
        <div className="space-y-4">
          {loading ? (
            <p>Carregando...</p>
          ) : userRequests.length > 0 ? (
            userRequests.map((request) => (
              <RequestCard 
                key={request.id} 
                request={request}
                onView={(req) => navigate(`/requests/${req.id}`)}
                onEdit={(req) => navigate(`/requests/${req.id}`)}
              />
            ))
          ) : (
            <Card className="p-8 text-center">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma solicitação encontrada</h3>
              <p className="text-muted-foreground mb-4">
                Você ainda não fez nenhuma solicitação de férias ou day off.
              </p>
              <Button onClick={() => navigate('/new-request')}>
                <Plus className="w-4 h-4 mr-2" />
                Fazer Primeira Solicitação
              </Button>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};