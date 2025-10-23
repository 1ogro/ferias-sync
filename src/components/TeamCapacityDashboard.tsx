import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Users, Calendar, TrendingDown, Activity, Clock, Briefcase, Baby, Edit, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTeamCapacityAlerts, getSpecialApprovals } from "@/lib/medicalLeaveUtils";
import { TeamCapacityAlert, SpecialApproval, Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PlannedAbsence {
  id: string;
  tipo: string;
  inicio: string;
  fim: string;
  requester_id: string;
  status: string;
  requester: {
    nome: string;
    cargo: string;
    sub_time: string;
  };
}

export const TeamCapacityDashboard = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<TeamCapacityAlert[]>([]);
  const [specialApprovals, setSpecialApprovals] = useState<SpecialApproval[]>([]);
  const [plannedAbsences, setPlannedAbsences] = useState<PlannedAbsence[]>([]);
  const [loading, setLoading] = useState(false);
  const [historicalCount, setHistoricalCount] = useState(0);
  const [currentUserPerson, setCurrentUserPerson] = useState<Person | null>(null);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const { user, loading: authLoading } = useAuth();

  const loadDashboardData = async () => {
    if (!user || authLoading) {
      console.log('User not authenticated or still loading, skipping dashboard load');
      return;
    }

    setLoading(true);
    try {
      console.log('Loading dashboard data for user:', user.id);
      
      const today = new Date().toISOString().split('T')[0];
      
      const [alertsData, approvalsData, plannedAbsencesData, historicalRequests] = await Promise.all([
        getTeamCapacityAlerts(),
        getSpecialApprovals(),
        supabase
          .from('requests')
          .select(`
            id,
            tipo,
            inicio,
            fim,
            requester_id,
            status,
            people!requests_requester_id_fkey(nome, cargo, sub_time)
          `)
          .in('status', ['APROVADO_FINAL', 'REALIZADO'])
          .in('tipo', ['FERIAS', 'LICENCA_MATERNIDADE', 'LICENCA_MEDICA', 'DAY_OFF'])
          .lte('inicio', today)
          .gte('fim', today),
        supabase
          .from('requests')
          .select('id')
          .eq('is_historical', true)
          .gte('created_at', new Date(new Date().setDate(new Date().getDate() - 30)).toISOString())
      ]);
      
      const processedPlannedAbsences: PlannedAbsence[] = plannedAbsencesData.data?.map(absence => ({
        id: absence.id,
        tipo: absence.tipo,
        inicio: absence.inicio,
        fim: absence.fim,
        requester_id: absence.requester_id,
        status: absence.status,
        requester: {
          nome: absence.people?.nome || 'N/A',
          cargo: absence.people?.cargo || 'N/A',
          sub_time: absence.people?.sub_time || 'N/A'
        }
      })) || [];
      
      setAlerts(alertsData);
      setSpecialApprovals(approvalsData.slice(0, 10));
      setPlannedAbsences(processedPlannedAbsences);
      setHistoricalCount(historicalRequests?.data?.length || 0);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) {
      loadDashboardData();
    }
  }, [user, authLoading]);

  useEffect(() => {
    const fetchCurrentUserAndPeople = async () => {
      if (!user) return;
      
      const [profileData, peopleData] = await Promise.all([
        supabase
          .from('profiles')
          .select('person_id, people!inner(*)')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('people')
          .select('*')
          .eq('ativo', true)
      ]);
      
      if (profileData.data?.people) {
        setCurrentUserPerson(profileData.data.people as any);
      }
      
      if (peopleData.data) {
        setAllPeople(peopleData.data as any);
      }
    };
    
    if (user) {
      fetchCurrentUserAndPeople();
    }
  }, [user]);

  const canEditAbsence = (requesterId: string) => {
    if (!currentUserPerson) return false;
    
    const isDirectorOrAdmin = currentUserPerson.papel === 'DIRETOR' || currentUserPerson.is_admin;
    if (isDirectorOrAdmin) return true;
    
    // Verificar se é gestor do solicitante
    const requesterPerson = allPeople.find(p => p.id === requesterId);
    return requesterPerson?.gestorId === currentUserPerson.id;
  };

  const handleDeleteAbsence = async (absence: PlannedAbsence) => {
    const isDirectorOrAdmin = currentUserPerson?.papel === 'DIRETOR' || currentUserPerson?.is_admin;
    const isManager = allPeople?.find(p => p.id === absence.requester_id)?.gestorId === currentUserPerson?.id;
    const isOwnRequest = currentUserPerson?.id === absence.requester_id;
    
    // Verificar se é solicitação não-aprovada (colaborador pode excluir suas próprias)
    const nonApprovedStatuses = ['RASCUNHO', 'PENDENTE', 'INFORMACOES_ADICIONAIS', 'REJEITADO'];
    const isNonApproved = nonApprovedStatuses.includes(absence.status);
    
    // Permissões:
    // - Diretor/Admin: tudo
    // - Gestor: subordinados
    // - Colaborador: próprias solicitações não-aprovadas
    const canDelete = isDirectorOrAdmin || isManager || (isOwnRequest && isNonApproved);
    
    if (!canDelete) {
      return;
    }

    // Se for exclusão administrativa (não é colaborador excluindo própria não-aprovada), solicitar justificativa
    const isAdminDeletion = !isOwnRequest || !isNonApproved;
    let justification = "";
    
    if (isAdminDeletion) {
      justification = prompt(
        "Por favor, informe a justificativa para excluir esta solicitação.\n" +
        "Esta ação será registrada no histórico de auditoria:"
      ) || "";
      
      if (!justification.trim()) {
        return;
      }
    }

    const confirmMessage = isAdminDeletion
      ? `⚠️ EXCLUSÃO ADMINISTRATIVA\n\n` +
        `Colaborador: ${absence.requester.nome}\n` +
        `Período: ${format(new Date(absence.inicio), "dd/MM/yyyy")} - ${format(new Date(absence.fim), "dd/MM/yyyy")}\n\n` +
        `Esta ação NÃO pode ser desfeita!\n` +
        `Tem certeza que deseja excluir?`
      : `Tem certeza que deseja excluir esta solicitação?\n\n` +
        `Período: ${format(new Date(absence.inicio), "dd/MM/yyyy")} - ${format(new Date(absence.fim), "dd/MM/yyyy")}`;
    
    if (!confirm(confirmMessage)) return;

    try {
      // Registrar no audit_log apenas para exclusões administrativas
      if (isAdminDeletion) {
        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert({
            entidade: 'requests',
            entidade_id: absence.id,
            acao: 'ADMIN_DELETE',
            actor_id: currentUserPerson?.id,
            payload: {
              request_data: absence,
              deletion_justification: justification,
              deleted_from: 'team_capacity_dashboard'
            }
          } as any);

        if (auditError) throw auditError;
      }

      // Excluir a solicitação
      const { error: deleteError } = await supabase
        .from('requests')
        .delete()
        .eq('id', absence.id);

      if (deleteError) throw deleteError;

      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao excluir:', error);
    }
  };

  const canDeleteAbsence = (absence: PlannedAbsence) => {
    if (!currentUserPerson) return false;
    
    const isDirectorOrAdmin = currentUserPerson.papel === 'DIRETOR' || currentUserPerson.is_admin;
    if (isDirectorOrAdmin) return true;
    
    const isManager = allPeople?.find(p => p.id === absence.requester_id)?.gestorId === currentUserPerson.id;
    if (isManager) return true;
    
    // Colaborador pode excluir suas próprias solicitações não-aprovadas
    const isOwnRequest = currentUserPerson.id === absence.requester_id;
    const nonApprovedStatuses = ['RASCUNHO', 'PENDENTE', 'INFORMACOES_ADICIONAIS', 'REJEITADO'];
    const isNonApproved = nonApprovedStatuses.includes(absence.status);
    
    return isOwnRequest && isNonApproved;
  };

  const getCriticalAlerts = () => {
    return alerts.filter(alert => alert.affected_people_count >= 2);
  };

  const getAlertSeverity = (count: number) => {
    if (count >= 3) return "critical";
    if (count >= 2) return "high";
    return "medium";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800";
      case "high":
        return "bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800";
      default:
        return "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800";
    }
  };

  const recentApprovals = specialApprovals.filter(approval => {
    const approvalDate = new Date(approval.manager_approval_date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return approvalDate >= weekAgo;
  });

  // Helper function for absence badges
  const getAbsenceBadge = (tipo: string) => {
    switch (tipo) {
      case 'LICENCA_MATERNIDADE':
        return { icon: Baby, label: 'Lic. Maternidade', variant: 'secondary' as const };
      case 'LICENCA_MEDICA':
        return { icon: Activity, label: 'Lic. Médica', variant: 'destructive' as const };
      case 'DAY_OFF':
        return { icon: Clock, label: 'Day Off', variant: 'outline' as const };
      default: // FERIAS
        return { icon: Briefcase, label: 'Férias', variant: 'default' as const };
    }
  };

  // Calculate capacity impact by team
  const capacityByTeam = useMemo(() => {
    const teamImpact: Record<string, { 
      medicalLeaves: number; 
      plannedAbsences: number; 
      licencaMedica: number;
      dayOff: number;
      total: number 
    }> = {};

    // Medical leaves impact
    alerts.forEach(alert => {
      if (!teamImpact[alert.team_id]) {
        teamImpact[alert.team_id] = { 
          medicalLeaves: 0, 
          plannedAbsences: 0, 
          licencaMedica: 0,
          dayOff: 0,
          total: 0 
        };
      }
      teamImpact[alert.team_id].medicalLeaves = alert.affected_people_count;
      teamImpact[alert.team_id].total += alert.affected_people_count;
    });

    // Planned absences impact by type
    plannedAbsences.forEach(absence => {
      const team = absence.requester.sub_time;
      if (!teamImpact[team]) {
        teamImpact[team] = { 
          medicalLeaves: 0, 
          plannedAbsences: 0, 
          licencaMedica: 0,
          dayOff: 0,
          total: 0 
        };
      }
      
      if (absence.tipo === 'FERIAS' || absence.tipo === 'LICENCA_MATERNIDADE') {
        teamImpact[team].plannedAbsences += 1;
      } else if (absence.tipo === 'LICENCA_MEDICA') {
        teamImpact[team].licencaMedica += 1;
      } else if (absence.tipo === 'DAY_OFF') {
        teamImpact[team].dayOff += 1;
      }
      
      teamImpact[team].total += 1;
    });

    return teamImpact;
  }, [alerts, plannedAbsences]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <p>Carregando dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.length}</div>
            <p className="text-xs text-muted-foreground">
              {getCriticalAlerts().length} críticos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovações Especiais</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentApprovals.length}</div>
            <p className="text-xs text-muted-foreground">
              Últimos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solicitações Históricas</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{historicalCount}</div>
            <p className="text-xs text-muted-foreground">
              Últimos 30 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ausências Programadas</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plannedAbsences.length}</div>
            <p className="text-xs text-muted-foreground">
              Ausências ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Capacidade Total</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(capacityByTeam).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Times com capacidade reduzida
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {getCriticalAlerts().length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Atenção:</strong> {getCriticalAlerts().length} time(s) com capacidade crítica (2+ pessoas ausentes)
          </AlertDescription>
        </Alert>
      )}

      {/* Planned Absences */}
      {plannedAbsences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Ausências Programadas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {plannedAbsences.map((absence) => (
                <div key={absence.id} className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{absence.requester.nome}</div>
                      <div className="text-sm text-muted-foreground">
                        {absence.requester.cargo} • {absence.requester.sub_time}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {(() => {
                          const { label, variant } = getAbsenceBadge(absence.tipo);
                          return <Badge variant={variant} className="text-xs">{label}</Badge>;
                        })()}
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(absence.inicio), "dd/MM", { locale: ptBR })} - {format(new Date(absence.fim), "dd/MM", { locale: ptBR })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {canEditAbsence(absence.requester_id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/requests/${absence.id}/edit`)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {canDeleteAbsence(absence) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAbsence(absence)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Capacity Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertas de Capacidade por Time (Licenças Médicas)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4" />
              <p>Nenhum alerta de capacidade ativo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => {
                const severity = getAlertSeverity(alert.affected_people_count);
                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${getSeverityColor(severity)}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">Time: {alert.team_id}</div>
                      <Badge variant="outline" className="text-xs">
                        {alert.affected_people_count} pessoas
                      </Badge>
                    </div>
                    <div className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-3 w-3" />
                        Período: {format(new Date(alert.period_start), "dd/MM/yyyy", { locale: ptBR })} até{" "}
                        {format(new Date(alert.period_end), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Capacidade reduzida devido a licenças médicas
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Special Approvals */}
      <Card>
        <CardHeader>
          <CardTitle>Aprovações Especiais Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentApprovals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4" />
              <p>Nenhuma aprovação especial nos últimos 7 dias</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      Aprovação durante licença médica
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(approval.manager_approval_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">
                      {approval.director_notification_date ? "Notificado" : "Pendente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};