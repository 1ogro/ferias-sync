import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DeletionDialog } from "@/components/DeletionDialog";
import { parseDateSafely } from "@/lib/dateUtils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Download, Users, Clock, TrendingUp, Briefcase, Baby, Activity, Edit, Trash2 } from "lucide-react";
import { Person } from "@/lib/types";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ApprovedVacation {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_cargo: string;
  requester_sub_time: string;
  start_date: string;
  end_date: string;
  vacation_days: number;
  status: string;
  approver_name: string;
  approval_date: string;
  tipo: string;
  data_prevista_parto?: string;
}

interface FilterOptions {
  managers: { id: string; name: string }[];
  teams: string[];
}

export function ApprovedVacationsExecutiveView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vacations, setVacations] = useState<ApprovedVacation[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    managers: [],
    teams: []
  });
  const [loading, setLoading] = useState(true);
  const [currentUserPerson, setCurrentUserPerson] = useState<Person | null>(null);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<number | "all">(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedManager, setSelectedManager] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  
  // Estados para o dialog de exclusão
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);
  const [selectedVacation, setSelectedVacation] = useState<ApprovedVacation | null>(null);

  const loadApprovedVacations = async () => {
    try {
      setLoading(true);
      
      // Query para buscar férias e licenças maternidade aprovadas com informações dos gestores
      const { data: vacationsData, error } = await supabase
        .from('requests')
        .select(`
          id,
          requester_id,
          inicio,
          fim,
          tipo,
          status,
          created_at,
          data_prevista_parto,
          people!requests_requester_id_fkey (
            id,
            nome,
            cargo,
            sub_time
          ),
          approvals (
            approver_id,
            created_at,
            acao,
            people!approvals_approver_id_fkey (
              nome
            )
          )
        `)
        .in('tipo', ['FERIAS', 'LICENCA_MATERNIDADE', 'LICENCA_MEDICA', 'DAY_OFF'])
        .in('status', ['APROVADO_FINAL', 'REALIZADO'])
        .not('inicio', 'is', null)
        .not('fim', 'is', null)
        .order('inicio', { ascending: false });

      if (error) throw error;

      // Processar dados para incluir informações de aprovação
      const processedVacations: ApprovedVacation[] = vacationsData?.map(vacation => {
        const approvals = vacation.approvals || [];
        const finalApproval = approvals.find(a => a.acao === 'APROVADO_FINAL') || approvals[approvals.length - 1];
        const vacationDays = vacation.inicio && vacation.fim 
          ? Math.ceil((parseDateSafely(vacation.fim).getTime() - parseDateSafely(vacation.inicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
          : 0;

        return {
          id: vacation.id,
          requester_id: vacation.requester_id,
          requester_name: vacation.people?.nome || 'N/A',
          requester_cargo: vacation.people?.cargo || 'N/A',
          requester_sub_time: vacation.people?.sub_time || 'N/A',
          start_date: vacation.inicio,
          end_date: vacation.fim,
          vacation_days: vacationDays,
          status: vacation.status,
          approver_name: finalApproval?.people?.nome || 'Sistema',
          approval_date: finalApproval?.created_at || vacation.created_at,
          tipo: vacation.tipo,
          data_prevista_parto: vacation.data_prevista_parto
        };
      }) || [];

      setVacations(processedVacations);

      // Extrair opções de filtro
      const uniqueManagers = Array.from(
        new Set(processedVacations.map(v => v.approver_name))
      ).map(name => ({ id: name, name }));
      
      const uniqueTeams = Array.from(
        new Set(processedVacations.map(v => v.requester_sub_time).filter(Boolean))
      );

      setFilterOptions({
        managers: uniqueManagers,
        teams: uniqueTeams
      });

    } catch (error) {
      console.error('Erro ao carregar férias aprovadas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadApprovedVacations();
    }
  }, [user]);

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

  const canEditVacation = (requesterId: string) => {
    if (!currentUserPerson) return false;
    
    const isDirectorOrAdmin = currentUserPerson.papel === 'DIRETOR' || currentUserPerson.is_admin;
    if (isDirectorOrAdmin) return true;
    
    // Verificar se é gestor do solicitante
    const requesterPerson = allPeople.find(p => p.id === requesterId);
    return requesterPerson?.gestorId === currentUserPerson.id;
  };

  const openDeleteDialog = (vacation: ApprovedVacation) => {
    setSelectedVacation(vacation);
    setDeletionDialogOpen(true);
  };

  const confirmDelete = async (justification?: string) => {
    if (!selectedVacation || !justification?.trim()) return;

    try {
      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: selectedVacation.id,
          acao: 'ADMIN_DELETE',
          actor_id: currentUserPerson?.id,
          payload: {
            request_data: selectedVacation,
            deletion_justification: justification,
            deleted_from: 'approved_vacations_executive_view'
          }
        } as any);

      if (auditError) throw auditError;

      const { error: deleteError } = await supabase
        .from('requests')
        .delete()
        .eq('id', selectedVacation.id);

      if (deleteError) throw deleteError;

      setDeletionDialogOpen(false);
      setSelectedVacation(null);
      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao excluir:', error);
      setDeletionDialogOpen(false);
      setSelectedVacation(null);
    }
  };

  const canDeleteVacation = (vacationId: string) => {
    if (!currentUserPerson) return false;
    
    const isDirectorOrAdmin = currentUserPerson.papel === 'DIRETOR' || currentUserPerson.is_admin;
    if (isDirectorOrAdmin) return true;
    
    const vacation = filteredVacations.find(v => v.id === vacationId);
    if (!vacation) return false;
    
    const requesterPerson = allPeople.find(p => p.id === vacation.requester_id);
    return requesterPerson?.gestorId === currentUserPerson.id;
  };

  // Filtrar dados
  const filteredVacations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return vacations.filter(vacation => {
      const startDate = parseDateSafely(vacation.start_date);
      const endDate = parseDateSafely(vacation.end_date);
      
      const matchesSearch = vacation.requester_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           vacation.requester_cargo.toLowerCase().includes(searchTerm.toLowerCase());
      // Verificar se a ausência está ativa no mês selecionado (overlap check)
      const matchesMonth = selectedMonth === "all" ? true : (() => {
        const selectedMonthStart = new Date(selectedYear, selectedMonth - 1, 1);
        const selectedMonthEnd = new Date(selectedYear, selectedMonth, 0);
        return (startDate <= selectedMonthEnd && endDate >= selectedMonthStart);
      })();
      const matchesYear = true; // já contemplado no matchesMonth
      const matchesManager = selectedManager === 'all' || vacation.approver_name === selectedManager;
      const matchesTeam = selectedTeam === 'all' || vacation.requester_sub_time === selectedTeam;
      const matchesStatus = selectedStatus === 'all' || vacation.status === selectedStatus;
      const matchesType = selectedType === 'all' || vacation.tipo === selectedType;

      // Active filter - acontecendo agora
      if (showOnlyActive) {
        const isActive = startDate <= today && endDate >= today;
        if (!isActive) return false;
      }

      // Upcoming filter - próximas 30 dias
      if (showUpcoming) {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const isUpcoming = startDate >= today && startDate <= thirtyDaysFromNow;
        if (!isUpcoming) return false;
      }

      return matchesSearch && matchesMonth && matchesYear && matchesManager && matchesTeam && matchesStatus && matchesType;
    });
  }, [vacations, searchTerm, selectedMonth, selectedYear, selectedManager, selectedTeam, selectedStatus, selectedType, showOnlyActive, showUpcoming]);

  // Helper function for type badges
  const getTypeBadge = (tipo: string) => {
    switch (tipo) {
      case 'LICENCA_MATERNIDADE':
        return { label: 'Lic. Maternidade', variant: 'secondary' as const };
      case 'LICENCA_MEDICA':
        return { label: 'Lic. Médica', variant: 'destructive' as const };
      case 'DAY_OFF':
        return { label: 'Day Off', variant: 'outline' as const };
      default:
        return { label: 'Férias', variant: 'default' as const };
    }
  };

  // Estatísticas
  const stats = useMemo(() => {
    const vacations = filteredVacations.filter(v => v.tipo === 'FERIAS');
    const maternityLeaves = filteredVacations.filter(v => v.tipo === 'LICENCA_MATERNIDADE');
    const licencaMedica = filteredVacations.filter(v => v.tipo === 'LICENCA_MEDICA');
    const dayOff = filteredVacations.filter(v => v.tipo === 'DAY_OFF');
    
    return {
      totalVacations: vacations.length,
      totalMaternityLeaves: maternityLeaves.length,
      totalLicencaMedica: licencaMedica.length,
      totalDayOff: dayOff.length,
      totalDays: filteredVacations.reduce((sum, v) => sum + v.vacation_days, 0),
      vacationDays: vacations.reduce((sum, v) => sum + v.vacation_days, 0),
      maternityDays: maternityLeaves.reduce((sum, v) => sum + v.vacation_days, 0),
      licencaMedicaDays: licencaMedica.reduce((sum, v) => sum + v.vacation_days, 0),
      dayOffDays: dayOff.reduce((sum, v) => sum + v.vacation_days, 0),
      byTeam: filteredVacations.reduce((acc, v) => {
        acc[v.requester_sub_time] = (acc[v.requester_sub_time] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byManager: filteredVacations.reduce((acc, v) => {
        acc[v.approver_name] = (acc[v.approver_name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }, [filteredVacations]);

  const exportToCSV = () => {
    const headers = [
      'Tipo', 'Colaborador', 'Cargo', 'Time', 'Início', 'Fim', 'Dias', 'Status', 'Aprovador', 'Data Aprovação'
    ];
    
    const csvData = filteredVacations.map(vacation => [
      vacation.tipo === 'FERIAS' ? 'Férias' : 
      vacation.tipo === 'LICENCA_MATERNIDADE' ? 'Licença Maternidade' :
      vacation.tipo === 'LICENCA_MEDICA' ? 'Licença Médica' : 'Day Off',
      vacation.requester_name,
      vacation.requester_cargo,
      vacation.requester_sub_time,
      format(parseDateSafely(vacation.start_date), 'dd/MM/yyyy'),
      format(parseDateSafely(vacation.end_date), 'dd/MM/yyyy'),
      vacation.vacation_days.toString(),
      vacation.status,
      vacation.approver_name,
      format(new Date(vacation.approval_date), 'dd/MM/yyyy HH:mm')
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ausencias_aprovadas_${selectedMonth}_${selectedYear}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <p>Carregando férias aprovadas...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Férias Aprovadas</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVacations}</div>
            <p className="text-xs text-muted-foreground">
              {stats.vacationDays} dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lic. Maternidade</CardTitle>
            <Baby className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMaternityLeaves}</div>
            <p className="text-xs text-muted-foreground">
              {stats.maternityDays} dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Licenças Médicas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLicencaMedica}</div>
            <p className="text-xs text-muted-foreground">
              {stats.licencaMedicaDays} dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Day Offs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDayOff}</div>
            <p className="text-xs text-muted-foreground">
              {stats.dayOffDays} dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Dias</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDays}</div>
            <p className="text-xs text-muted-foreground">
              dias aprovados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Times Envolvidos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(stats.byTeam).length}</div>
            <p className="text-xs text-muted-foreground">
              times diferentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média por Ausência</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats.totalVacations + stats.totalMaternityLeaves + stats.totalLicencaMedica + stats.totalDayOff) > 0 
                ? Math.round(stats.totalDays / (stats.totalVacations + stats.totalMaternityLeaves + stats.totalLicencaMedica + stats.totalDayOff)) 
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              dias por ausência
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Filtros</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={showOnlyActive ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowOnlyActive(!showOnlyActive);
                  setShowUpcoming(false);
                }}
              >
                <Users className="w-4 h-4 mr-2" />
                Ativas Hoje
              </Button>
              <Button
                variant={showUpcoming ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowUpcoming(!showUpcoming);
                  setShowOnlyActive(false);
                }}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Próximas 30 Dias
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <Input
              placeholder="Buscar colaborador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
            <SelectContent className="z-50 bg-background">
              <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="FERIAS">Férias</SelectItem>
                <SelectItem value="LICENCA_MATERNIDADE">Licença Maternidade</SelectItem>
                <SelectItem value="LICENCA_MEDICA">Licença Médica</SelectItem>
                <SelectItem value="DAY_OFF">Day Off</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedMonth === "all" ? "all" : selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(value === "all" ? "all" : parseInt(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background">
                <SelectItem value="all">Todos os meses</SelectItem>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {format(new Date(2024, i), 'MMMM', { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background">
                {Array.from({ length: 5 }, (_, i) => (
                  <SelectItem key={2022 + i} value={(2022 + i).toString()}>
                    {2022 + i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedManager} onValueChange={setSelectedManager}>
              <SelectTrigger>
                <SelectValue placeholder="Gestor Aprovador" />
              </SelectTrigger>
            <SelectContent className="z-50 bg-background">
              <SelectItem value="all">Todos os gestores</SelectItem>
                {filterOptions.managers.map(manager => (
                  <SelectItem key={manager.id} value={manager.name}>
                    {manager.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger>
                <SelectValue placeholder="Time" />
              </SelectTrigger>
            <SelectContent className="z-50 bg-background">
              <SelectItem value="all">Todos os times</SelectItem>
                {filterOptions.teams.map(team => (
                  <SelectItem key={team} value={team}>
                    {team}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
            <SelectContent className="z-50 bg-background">
              <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="APROVADO_FINAL">Aprovado Final</SelectItem>
                <SelectItem value="REALIZADO">Realizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-muted-foreground">
              {filteredVacations.length} ausência{filteredVacations.length !== 1 ? 's' : ''} encontrada{filteredVacations.length !== 1 ? 's' : ''}
            </p>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Ausências Aprovadas */}
      <Card>
        <CardHeader>
          <CardTitle>Ausências Aprovadas</CardTitle>
        </CardHeader>
        <CardContent>
      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aprovador</TableHead>
                  <TableHead>Data Aprovação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVacations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-6">
                    Nenhuma ausência aprovada encontrada para os filtros selecionados.
                  </TableCell>
                </TableRow>
                ) : (
                  filteredVacations.map((vacation) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const startDate = parseDateSafely(vacation.start_date);
                    const endDate = parseDateSafely(vacation.end_date);
                    const isActiveNow = startDate <= today && endDate >= today;
                    
                    return (
                      <TableRow key={vacation.id} className={isActiveNow ? "bg-primary/5" : ""}>
                        <TableCell>
                          {(() => {
                            const { label, variant } = getTypeBadge(vacation.tipo);
                            const IconComponent = vacation.tipo === 'LICENCA_MATERNIDADE' ? Baby :
                                                  vacation.tipo === 'LICENCA_MEDICA' ? Activity :
                                                  vacation.tipo === 'DAY_OFF' ? Clock : Briefcase;
                            return (
                              <Badge variant={variant} className="flex items-center gap-1 w-fit">
                                <IconComponent className="w-3 h-3" />
                                {label}
                              </Badge>
                            );
                          })()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {vacation.requester_name}
                      </TableCell>
                      <TableCell>{vacation.requester_cargo}</TableCell>
                      <TableCell>{vacation.requester_sub_time}</TableCell>
                      <TableCell>
                        {format(parseDateSafely(vacation.start_date), 'dd/MM/yyyy')} -{' '}
                        {format(parseDateSafely(vacation.end_date), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>{vacation.vacation_days} dias</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={vacation.status === 'REALIZADO' ? 'default' : 'secondary'}>
                            {vacation.status === 'APROVADO_FINAL' ? 'Aprovado' : 'Realizado'}
                          </Badge>
                          {isActiveNow && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                              ATIVA AGORA
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{vacation.approver_name}</TableCell>
                      <TableCell>
                        {format(new Date(vacation.approval_date), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEditVacation(vacation.requester_id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/requests/${vacation.id}/edit`)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeleteVacation(vacation.id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(vacation)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Deletion Dialog */}
      {selectedVacation && (
        <DeletionDialog
          open={deletionDialogOpen}
          onOpenChange={setDeletionDialogOpen}
          onConfirm={confirmDelete}
          title="⚠️ EXCLUSÃO ADMINISTRATIVA"
          description={`Colaborador: ${selectedVacation.requester_name}\nPeríodo: ${format(new Date(selectedVacation.start_date), "dd/MM/yyyy")} - ${format(new Date(selectedVacation.end_date), "dd/MM/yyyy")}\n\nEsta ação NÃO pode ser desfeita!`}
          requireJustification={true}
          isAdminDeletion={true}
        />
      )}
    </div>
  );
}