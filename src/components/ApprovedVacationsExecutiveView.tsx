import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Calendar, Download, Users, Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ApprovedVacation {
  id: string;
  requester_name: string;
  requester_cargo: string;
  requester_sub_time: string;
  start_date: string;
  end_date: string;
  vacation_days: number;
  status: string;
  approver_name: string;
  approval_date: string;
}

interface FilterOptions {
  managers: { id: string; name: string }[];
  teams: string[];
}

export function ApprovedVacationsExecutiveView() {
  const { user } = useAuth();
  const [vacations, setVacations] = useState<ApprovedVacation[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    managers: [],
    teams: []
  });
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedManager, setSelectedManager] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const loadApprovedVacations = async () => {
    try {
      setLoading(true);
      
      // Query para buscar férias aprovadas com informações dos gestores
      const { data: vacationsData, error } = await supabase
        .from('requests')
        .select(`
          id,
          inicio,
          fim,
          status,
          created_at,
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
        .eq('tipo', 'FERIAS')
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
          ? Math.ceil((new Date(vacation.fim).getTime() - new Date(vacation.inicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
          : 0;

        return {
          id: vacation.id,
          requester_name: vacation.people?.nome || 'N/A',
          requester_cargo: vacation.people?.cargo || 'N/A',
          requester_sub_time: vacation.people?.sub_time || 'N/A',
          start_date: vacation.inicio,
          end_date: vacation.fim,
          vacation_days: vacationDays,
          status: vacation.status,
          approver_name: finalApproval?.people?.nome || 'Sistema',
          approval_date: finalApproval?.created_at || vacation.created_at
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

  // Filtrar dados
  const filteredVacations = useMemo(() => {
    return vacations.filter(vacation => {
      const startDate = new Date(vacation.start_date);
      const matchesSearch = vacation.requester_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           vacation.requester_cargo.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = startDate.getMonth() + 1 === selectedMonth;
      const matchesYear = startDate.getFullYear() === selectedYear;
      const matchesManager = selectedManager === 'all' || vacation.approver_name === selectedManager;
      const matchesTeam = selectedTeam === 'all' || vacation.requester_sub_time === selectedTeam;
      const matchesStatus = selectedStatus === 'all' || vacation.status === selectedStatus;

      return matchesSearch && matchesMonth && matchesYear && matchesManager && matchesTeam && matchesStatus;
    });
  }, [vacations, searchTerm, selectedMonth, selectedYear, selectedManager, selectedTeam, selectedStatus]);

  // Estatísticas
  const stats = useMemo(() => {
    return {
      totalVacations: filteredVacations.length,
      totalDays: filteredVacations.reduce((sum, v) => sum + v.vacation_days, 0),
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
      'Colaborador', 'Cargo', 'Time', 'Início', 'Fim', 'Dias', 'Status', 'Aprovador', 'Data Aprovação'
    ];
    
    const csvData = filteredVacations.map(vacation => [
      vacation.requester_name,
      vacation.requester_cargo,
      vacation.requester_sub_time,
      format(new Date(vacation.start_date), 'dd/MM/yyyy'),
      format(new Date(vacation.end_date), 'dd/MM/yyyy'),
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
    link.download = `ferias_aprovadas_${selectedMonth}_${selectedYear}.csv`;
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Férias Aprovadas</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVacations}</div>
            <p className="text-xs text-muted-foreground">
              no período selecionado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dias Totais</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDays}</div>
            <p className="text-xs text-muted-foreground">
              dias de férias aprovados
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
            <CardTitle className="text-sm font-medium">Média por Aprovação</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalVacations > 0 ? Math.round(stats.totalDays / stats.totalVacations) : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              dias por férias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Input
              placeholder="Buscar colaborador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
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
              <SelectContent>
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
              <SelectContent>
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
              <SelectContent>
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
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="APROVADO_FINAL">Aprovado Final</SelectItem>
                <SelectItem value="REALIZADO">Realizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-muted-foreground">
              {filteredVacations.length} férias encontradas
            </p>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Férias Aprovadas */}
      <Card>
        <CardHeader>
          <CardTitle>Férias Aprovadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aprovador</TableHead>
                  <TableHead>Data Aprovação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVacations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6">
                      Nenhuma féria aprovada encontrada para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVacations.map((vacation) => (
                    <TableRow key={vacation.id}>
                      <TableCell className="font-medium">
                        {vacation.requester_name}
                      </TableCell>
                      <TableCell>{vacation.requester_cargo}</TableCell>
                      <TableCell>{vacation.requester_sub_time}</TableCell>
                      <TableCell>
                        {format(new Date(vacation.start_date), 'dd/MM/yyyy')} -{' '}
                        {format(new Date(vacation.end_date), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>{vacation.vacation_days} dias</TableCell>
                      <TableCell>
                        <Badge variant={vacation.status === 'REALIZADO' ? 'default' : 'secondary'}>
                          {vacation.status === 'APROVADO_FINAL' ? 'Aprovado' : 'Realizado'}
                        </Badge>
                      </TableCell>
                      <TableCell>{vacation.approver_name}</TableCell>
                      <TableCell>
                        {format(new Date(vacation.approval_date), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}