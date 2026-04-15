import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestCard } from "./RequestCard";
import { VacationBalance } from "./VacationBalance";
import { VacationSummaryCard } from "./VacationSummaryCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseDateSafely } from "@/lib/dateUtils";
import { Status, TipoAusencia, Request } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  Calendar, 
  Plus, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Users,
  CalendarDays,
  Inbox
} from "lucide-react";
import React from "react";
import { useBirthdayNotifications } from "@/hooks/useBirthdayNotifications";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { person } = useAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<"overview" | "requests">("overview");
  const [userRequests, setUserRequests] = useState<Request[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
  const [activeAbsences, setActiveAbsences] = useState<Request[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  
  // Initialize birthday notifications for managers
  useBirthdayNotifications();

  useEffect(() => {
    if (person) {
      fetchUserRequests();
      fetchActiveAbsences();
      if (person.papel === 'GESTOR' || person.papel === 'DIRETOR' || person.is_admin) {
        fetchPendingApprovals();
      }
      if (person.papel === 'DIRETOR' || person.is_admin) {
        fetchPendingRegistrations();
      }
    }
  }, [person]);

  // Listen for request status updates from other components (like Inbox)
  useEffect(() => {
    const handleRequestUpdate = () => {
      console.log('Request status updated, refreshing dashboard data');
      if (person) {
        fetchUserRequests();
        if (person.papel === 'GESTOR' || person.papel === 'DIRETOR' || person.is_admin) {
          fetchPendingApprovals();
        }
      }
    };

    window.addEventListener('requestStatusUpdated', handleRequestUpdate);
    return () => window.removeEventListener('requestStatusUpdated', handleRequestUpdate);
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
          inicio: req.inicio ? parseDateSafely(req.inicio) : null,
          fim: req.fim ? parseDateSafely(req.fim) : null,
          tipoFerias: req.tipo_ferias,
          status: req.status as Status,
          justificativa: req.justificativa,
          conflitoFlag: req.conflito_flag,
          conflitoRefs: req.conflito_refs,
          createdAt: new Date(req.created_at),
          updatedAt: new Date(req.updated_at),
          isHistorical: req.is_historical || false,
          originalCreatedAt: req.original_created_at ? new Date(req.original_created_at) : undefined,
          originalChannel: req.original_channel,
          adminObservations: req.admin_observations,
          portal_rh_solicitado: req.portal_rh_solicitado
        }));
        setUserRequests(formattedRequests);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveAbsences = async () => {
    if (!person) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const { data } = await supabase
        .from('requests')
        .select(`
          *,
          requester:people!inner(*)
        `)
        .in('status', ['APROVADO_FINAL', 'REALIZADO'])
        .in('tipo', ['FERIAS', 'LICENCA_MATERNIDADE', 'DAYOFF', 'LICENCA_MEDICA'])
        .lte('inicio', today)
        .gte('fim', today)
        .order('fim', { ascending: true });
      
      if (data) {
        const formattedRequests: Request[] = data.map(req => ({
          id: req.id,
          requesterId: req.requester_id,
          requester: req.requester as any,
          tipo: req.tipo as TipoAusencia,
          inicio: req.inicio ? parseDateSafely(req.inicio) : null,
          fim: req.fim ? parseDateSafely(req.fim) : null,
          tipoFerias: req.tipo_ferias,
          status: req.status as Status,
          justificativa: req.justificativa,
          conflitoFlag: req.conflito_flag,
          conflitoRefs: req.conflito_refs,
          createdAt: new Date(req.created_at),
          updatedAt: new Date(req.updated_at),
          portal_rh_solicitado: req.portal_rh_solicitado
        }));
        setActiveAbsences(formattedRequests);
      }
    } catch (error) {
      console.error('Error fetching active absences:', error);
    }
  };

  const fetchPendingApprovals = async () => {
    if (!person) return;

    try {
      // First get all requests with requester info
      let { data: requestsData, error: requestsError } = await supabase
        .from('requests')
        .select(`
          *,
          requester:people!inner(id, nome, email, papel, gestor_id)
        `)
        .order('created_at', { ascending: false });

      if (requestsError) {
        console.error('Error fetching pending approvals:', requestsError);
        return;
      }

      // Filter based on role
      let filteredData = requestsData || [];

      if (person.papel === 'DIRETOR' || person.is_admin) {
        // Directors see all requests needing approval (including PENDENTE)
        filteredData = filteredData.filter(item => 
          [Status.PENDENTE, Status.EM_ANALISE_DIRETOR, Status.EM_ANALISE_GESTOR].includes(item.status as Status)
        );
      } else {
        // Managers see requests from their direct reports
        filteredData = filteredData.filter(item => 
          item.status === Status.EM_ANALISE_GESTOR && 
          item.requester.gestor_id === person.id
        );
      }

      // Transform the data to match Request type
      const transformedData = filteredData.map(item => ({
        id: item.id,
        requesterId: item.requester_id,
        tipo: item.tipo as TipoAusencia,
        inicio: item.inicio ? parseDateSafely(item.inicio) : null,
        fim: item.fim ? parseDateSafely(item.fim) : null,
        justificativa: item.justificativa,
        status: item.status as Status,
        diasAbono: item.dias_abono,
        createdAt: new Date(item.created_at),
        updatedAt: new Date(item.updated_at),
        conflitoFlag: item.conflito_flag,
        portal_rh_solicitado: item.portal_rh_solicitado,
        requester: {
          ...item.requester,
          papel: item.requester.papel as any,
          is_admin: false,
          ativo: true
        }
      }));

      setPendingApprovals(transformedData);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setApprovalsLoading(false);
    }
  };

  const pendingRequests = userRequests.filter(req =>
    [Status.PENDENTE, Status.EM_ANALISE_GESTOR, Status.EM_ANALISE_DIRETOR].includes(req.status)
  );
  const approvedRequests = userRequests.filter(req => {
    if (![Status.APROVADO_FINAL, Status.REALIZADO].includes(req.status)) return false;
    
    // For current year filtering, use the start date year for approved requests
    const currentYear = new Date().getFullYear();
    const requestYear = req.inicio ? req.inicio.getFullYear() : req.createdAt.getFullYear();
    return requestYear === currentYear;
  });

  // Filter future approved requests for "Próximos Períodos"
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const futureApprovedRequests = approvedRequests.filter(req => 
    req.inicio && req.inicio >= today
  ).sort((a, b) => (a.inicio?.getTime() || 0) - (b.inicio?.getTime() || 0));

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
      request.inicio && request.inicio.getFullYear() === currentYear
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

  const handleDeleteRequest = (request: Request) => {
    setRequestToDelete(request);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteRequest = async () => {
    if (!requestToDelete) return;

    try {
      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('id', requestToDelete.id);

      if (error) throw error;

      // Remove from local state
      setUserRequests(prev => prev.filter(r => r.id !== requestToDelete.id));
      
      toast({
        title: "Sucesso",
        description: "Rascunho excluído com sucesso!",
      });
    } catch (error) {
      console.error('Error deleting request:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir rascunho. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setRequestToDelete(null);
    }
  };

  const fetchPendingRegistrations = async () => {
    if (!person) return;
    try {
      const { count } = await supabase
        .from('pending_people')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDENTE');
      setPendingRegistrations(count || 0);
    } catch (error) {
      console.error('Error fetching pending registrations:', error);
    }
  };

  const isManagerOrDirector = person?.papel === 'GESTOR' || person?.papel === 'DIRETOR' || person?.is_admin;

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

      {/* Stats Grid - Primeira Linha: 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solicitações Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground">aguardando aprovação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovadas este Ano</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedRequests.length}</div>
            <p className="text-xs text-muted-foreground">em {new Date().getFullYear()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Days Off Disponíveis</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {dayOffInfo.disabled ? (
              <div>
                <div className="text-lg font-bold text-muted-foreground">—</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {dayOffInfo.message}
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-bold">{dayOffInfo.available}</div>
                <p className="text-xs text-muted-foreground">
                  {dayOffInfo.message}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending Registrations Alert - Directors/Admins only */}
      {(person?.papel === 'DIRETOR' || person?.is_admin) && pendingRegistrations > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-yellow-500/10">
                <Users className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="font-medium">
                  {pendingRegistrations} cadastro{pendingRegistrations !== 1 ? 's' : ''} pendente{pendingRegistrations !== 1 ? 's' : ''} de aprovação
                </p>
                <p className="text-sm text-muted-foreground">Novos colaboradores aguardando revisão do diretor</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/inbox')}>
              Ver na Inbox
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Segunda Linha: 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <VacationBalance />

        {/* Active Absences Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ausências Ativas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAbsences.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeAbsences.length === 1 ? "pessoa ausente hoje" : "pessoas ausentes hoje"}
            </p>
            {activeAbsences.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 w-full"
                onClick={() => navigate('/vacation-management?tab=active')}
              >
                Ver Detalhes
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals Card - Only for Managers and Directors */}
        {isManagerOrDirector ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aguardando Aprovação</CardTitle>
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvalsLoading ? "..." : pendingApprovals.length}</div>
              <p className="text-xs text-muted-foreground">
                {pendingApprovals.length === 1 ? "solicitação pendente" : "solicitações pendentes"}
              </p>
              {pendingApprovals.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2 w-full"
                  onClick={() => navigate('/inbox')}
                >
                  Ver Inbox
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Equipe</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">informações da equipe</p>
            </CardContent>
          </Card>
        )}
        
        {/* Vacation Management Card - Only for Directors and Admins, or placeholder */}
        {(person?.papel === 'DIRETOR' || person?.is_admin) ? (
          <VacationSummaryCard />
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Estatísticas</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">dados estatísticos</p>
            </CardContent>
          </Card>
        )}
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

          {/* Who's Away Today */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Quem Está de Férias Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeAbsences.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    Nenhuma ausência ativa no momento.
                  </p>
                ) : (
                  <>
                    {activeAbsences.slice(0, 5).map((absence) => {
                      const daysRemaining = absence.fim 
                        ? Math.ceil((absence.fim.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                        : 0;
                      
                      return (
                        <div key={absence.id} className="p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium">{absence.requester.nome}</div>
                              <div className="text-sm text-muted-foreground">
                                {absence.requester.cargo} • {absence.requester.subTime}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant={absence.tipo === TipoAusencia.LICENCA_MATERNIDADE ? 'secondary' : 'outline'} className="text-xs">
                                  {absence.tipo === TipoAusencia.LICENCA_MATERNIDADE ? 'Lic. Maternidade' : 'Férias'}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {absence.inicio && absence.fim && 
                                    `${absence.inicio.toLocaleDateString('pt-BR')} - ${absence.fim.toLocaleDateString('pt-BR')}`
                                  }
                                </span>
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              <div className="text-xs font-medium text-primary">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {daysRemaining === 0 ? 'Retorna hoje' : `Retorna em ${daysRemaining} dia${daysRemaining !== 1 ? 's' : ''}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {activeAbsences.length > 5 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => navigate('/vacation-management')}
                      >
                        Ver Todas ({activeAbsences.length})
                      </Button>
                    )}
                    
                    {activeAbsences.length > 0 && (
                      <div className="pt-2 border-t">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <AlertCircle className="w-4 h-4" />
                          <span>
                            {new Set(activeAbsences.map(a => a.requester.subTime)).size} time{new Set(activeAbsences.map(a => a.requester.subTime)).size !== 1 ? 's' : ''} impactado{new Set(activeAbsences.map(a => a.requester.subTime)).size !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Calendar Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Próximas Ausências Aprovadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loading ? (
                  <p>Carregando...</p>
                ) : futureApprovedRequests.length > 0 ? (
                  futureApprovedRequests.slice(0, 5).map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-8 rounded-full ${
                          request.tipo === TipoAusencia.FERIAS ? "bg-primary" : "bg-status-in-review"
                        }`} />
                        <div>
                          <p className="font-medium">{request.tipo === TipoAusencia.FERIAS ? "Férias" : "Day Off"}</p>
                          <p className="text-sm text-muted-foreground">
                            {request.inicio ? request.inicio.toLocaleDateString("pt-BR") : "Data não definida"}
                            {request.inicio && request.fim && request.inicio.getTime() !== request.fim.getTime() && 
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
                    Nenhuma ausência futura aprovada encontrada.
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
            userRequests.map((request) => {
              const isUserManagerOfRequester = person?.id === request.requester.gestorId;
              
              return (
                <RequestCard 
                  key={request.id} 
                  request={request}
                  onView={(req) => navigate(`/requests/${req.id}`)}
                  onEdit={(req) => navigate(`/requests/${req.id}/edit`)}
                  onDelete={handleDeleteRequest}
                  currentUserRole={person?.papel}
                  isUserManager={isUserManagerOfRequester}
                  currentUserId={person?.id}
                />
              );
            })
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este rascunho? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRequest} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};