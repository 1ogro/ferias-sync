import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Users, Calendar, TrendingDown } from "lucide-react";
import { getTeamCapacityAlerts, getSpecialApprovals } from "@/lib/medicalLeaveUtils";
import { TeamCapacityAlert, SpecialApproval } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const TeamCapacityDashboard = () => {
  const [alerts, setAlerts] = useState<TeamCapacityAlert[]>([]);
  const [specialApprovals, setSpecialApprovals] = useState<SpecialApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();

  const loadDashboardData = async () => {
    if (!user || authLoading) {
      console.log('User not authenticated or still loading, skipping dashboard load');
      return;
    }

    setLoading(true);
    try {
      console.log('Loading dashboard data for user:', user.id);
      const [alertsData, approvalsData] = await Promise.all([
        getTeamCapacityAlerts(),
        getSpecialApprovals()
      ]);
      
      console.log('Alerts loaded:', alertsData);
      console.log('Special approvals loaded:', approvalsData);
      setAlerts(alertsData);
      setSpecialApprovals(approvalsData.slice(0, 10)); // Show last 10 approvals
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
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      default:
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
    }
  };

  const recentApprovals = specialApprovals.filter(approval => {
    const approvalDate = new Date(approval.manager_approval_date);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return approvalDate >= weekAgo;
  });

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <CardTitle className="text-sm font-medium">Times Afetados</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(alerts.map(alert => alert.team_id)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Com capacidade reduzida
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

      {/* Team Capacity Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertas de Capacidade por Time
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