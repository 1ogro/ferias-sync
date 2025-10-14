import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Users, 
  Calendar, 
  Briefcase, 
  Baby, 
  AlertTriangle,
  Clock
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ActiveAbsence {
  id: string;
  requester_name: string;
  requester_cargo: string;
  requester_sub_time: string;
  start_date: string;
  end_date: string;
  tipo: string;
  dias_restantes: number;
}

export function ActiveAbsencesDashboard() {
  const { user } = useAuth();
  const [activeAbsences, setActiveAbsences] = useState<ActiveAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  useEffect(() => {
    if (user) {
      loadActiveAbsences();
    }
  }, [user]);

  const loadActiveAbsences = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('requests')
        .select(`
          id,
          inicio,
          fim,
          tipo,
          people!requests_requester_id_fkey (
            nome,
            cargo,
            sub_time
          )
        `)
        .in('status', ['APROVADO_FINAL', 'REALIZADO'])
        .in('tipo', ['FERIAS', 'LICENCA_MATERNIDADE'])
        .lte('inicio', today)
        .gte('fim', today)
        .order('fim', { ascending: true });

      if (error) throw error;

      const processedAbsences: ActiveAbsence[] = data?.map(absence => {
        const daysRemaining = differenceInDays(new Date(absence.fim), new Date());
        
        return {
          id: absence.id,
          requester_name: absence.people?.nome || 'N/A',
          requester_cargo: absence.people?.cargo || 'N/A',
          requester_sub_time: absence.people?.sub_time || 'N/A',
          start_date: absence.inicio,
          end_date: absence.fim,
          tipo: absence.tipo,
          dias_restantes: daysRemaining
        };
      }) || [];

      setActiveAbsences(processedAbsences);
    } catch (error) {
      console.error('Erro ao carregar ausências ativas:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAbsences = useMemo(() => {
    return activeAbsences.filter(absence => {
      const matchesTeam = selectedTeam === 'all' || absence.requester_sub_time === selectedTeam;
      const matchesType = selectedType === 'all' || absence.tipo === selectedType;
      return matchesTeam && matchesType;
    });
  }, [activeAbsences, selectedTeam, selectedType]);

  const stats = useMemo(() => {
    const ferias = activeAbsences.filter(a => a.tipo === 'FERIAS').length;
    const maternidade = activeAbsences.filter(a => a.tipo === 'LICENCA_MATERNIDADE').length;
    const teams = new Set(activeAbsences.map(a => a.requester_sub_time));
    
    // Calcular times com múltiplas ausências
    const teamCounts = activeAbsences.reduce((acc, absence) => {
      acc[absence.requester_sub_time] = (acc[absence.requester_sub_time] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const teamsWithMultipleAbsences = Object.values(teamCounts).filter(count => count >= 2).length;

    return {
      total: activeAbsences.length,
      ferias,
      maternidade,
      teamsImpacted: teams.size,
      teamsWithAlert: teamsWithMultipleAbsences
    };
  }, [activeAbsences]);

  const teamsWithMultipleAbsences = useMemo(() => {
    const teamCounts = filteredAbsences.reduce((acc, absence) => {
      if (!acc[absence.requester_sub_time]) {
        acc[absence.requester_sub_time] = [];
      }
      acc[absence.requester_sub_time].push(absence);
      return acc;
    }, {} as Record<string, ActiveAbsence[]>);

    return Object.entries(teamCounts)
      .filter(([_, absences]) => absences.length >= 2)
      .sort((a, b) => b[1].length - a[1].length);
  }, [filteredAbsences]);

  const uniqueTeams = useMemo(() => {
    return Array.from(new Set(activeAbsences.map(a => a.requester_sub_time))).sort();
  }, [activeAbsences]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <p>Carregando ausências ativas...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pessoas Ausentes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">ausentes hoje</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Férias Ativas</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ferias}</div>
            <p className="text-xs text-muted-foreground">em férias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Licenças Maternidade</CardTitle>
            <Baby className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.maternidade}</div>
            <p className="text-xs text-muted-foreground">ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Times Impactados</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.teamsImpacted}</div>
            <p className="text-xs text-muted-foreground">times afetados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas de Capacidade</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.teamsWithAlert}</div>
            <p className="text-xs text-muted-foreground">times com 2+ ausências</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {teamsWithMultipleAbsences.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>Atenção:</strong> {teamsWithMultipleAbsences.length} time(s) com múltiplas ausências simultâneas
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os times" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background">
                <SelectItem value="all">Todos os times</SelectItem>
                {uniqueTeams.map(team => (
                  <SelectItem key={team} value={team}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background">
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="FERIAS">Férias</SelectItem>
                <SelectItem value="LICENCA_MATERNIDADE">Licença Maternidade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Teams with Multiple Absences */}
      {teamsWithMultipleAbsences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Times com Múltiplas Ausências
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamsWithMultipleAbsences.map(([team, absences]) => (
                <div key={team} className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-orange-800">{team}</div>
                    <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                      {absences.length} pessoa{absences.length > 1 ? 's' : ''} ausente{absences.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {absences.map(absence => (
                      <div key={absence.id} className="flex items-center justify-between text-sm bg-white p-2 rounded">
                        <div>
                          <div className="font-medium">{absence.requester_name}</div>
                          <div className="text-xs text-muted-foreground">{absence.requester_cargo}</div>
                        </div>
                        <div className="text-right">
                          <Badge variant={absence.tipo === 'LICENCA_MATERNIDADE' ? 'secondary' : 'outline'} className="text-xs">
                            {absence.tipo === 'LICENCA_MATERNIDADE' ? 'Lic. Maternidade' : 'Férias'}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            Retorna em {absence.dias_restantes} dia{absence.dias_restantes !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Active Absences List */}
      <Card>
        <CardHeader>
          <CardTitle>Ausências Ativas ({filteredAbsences.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAbsences.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4" />
              <p>Nenhuma ausência ativa no momento</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAbsences.map(absence => (
                <div key={absence.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-1 h-16 rounded-full ${
                      absence.tipo === 'LICENCA_MATERNIDADE' ? 'bg-purple-500' : 'bg-blue-500'
                    }`} />
                    <div>
                      <div className="font-semibold">{absence.requester_name}</div>
                      <div className="text-sm text-muted-foreground">{absence.requester_cargo}</div>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {absence.requester_sub_time}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={absence.tipo === 'LICENCA_MATERNIDADE' ? 'secondary' : 'default'} className="mb-2">
                      {absence.tipo === 'LICENCA_MATERNIDADE' ? (
                        <><Baby className="w-3 h-3 mr-1" />Lic. Maternidade</>
                      ) : (
                        <><Briefcase className="w-3 h-3 mr-1" />Férias</>
                      )}
                    </Badge>
                    <div className="text-sm">
                      <div className="font-medium">
                        {format(new Date(absence.start_date), "dd/MM/yyyy")} - {format(new Date(absence.end_date), "dd/MM/yyyy")}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        Retorna em {absence.dias_restantes} dia{absence.dias_restantes !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
