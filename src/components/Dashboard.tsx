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
  CalendarDays
} from "lucide-react";
import React from "react";
import { useBirthdayNotifications } from "@/hooks/useBirthdayNotifications";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { person } = useAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<"overview" | "requests">("overview");
  const [userRequests, setUserRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<Request | null>(null);
  
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
          inicio: req.inicio ? new Date(req.inicio) : null,
          fim: req.fim ? new Date(req.fim) : null,
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

      {/* Stats Grid with 1-1-1-3 layout */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <Card className="col-span-12 sm:col-span-6 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solicitações Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground">aguardando aprovação</p>
          </CardContent>
        </Card>

        <Card className="col-span-12 sm:col-span-6 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovadas este Ano</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedRequests.length}</div>
            <p className="text-xs text-muted-foreground">em {new Date().getFullYear()}</p>
          </CardContent>
        </Card>

        <Card className="col-span-12 sm:col-span-6 lg:col-span-2">
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

        <VacationBalance className="col-span-12 lg:col-span-3" />
        
        {/* Vacation Management Card - Only for Directors and Admins */}
        {(person?.papel === 'DIRETOR' || person?.is_admin) && (
          <VacationSummaryCard className="col-span-12 lg:col-span-3" />
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
            userRequests.map((request) => (
               <RequestCard 
                 key={request.id} 
                 request={request}
                 onView={(req) => navigate(`/requests/${req.id}`)}
                 onEdit={(req) => navigate(`/requests/${req.id}/edit`)}
                 onDelete={handleDeleteRequest}
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