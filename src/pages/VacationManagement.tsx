import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAllVacationBalances, saveManualVacationBalance, deleteManualVacationBalance } from "@/lib/vacationUtils";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Person } from "@/lib/types";
import { Header } from "@/components/Header";
import { MedicalLeaveForm } from "@/components/MedicalLeaveForm";
import { MedicalLeaveList } from "@/components/MedicalLeaveList";
import { TeamCapacityDashboard } from "@/components/TeamCapacityDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  AlertTriangle,
  CalendarDays,
  Download,
  Edit,
  RotateCcw,
  CheckCircle,
  Search,
  Filter,
} from "lucide-react";
import { format } from "date-fns";

// Interface for vacation data display
interface VacationData {
  id?: string;
  person_id: string;
  year: number;
  accrued_days: number;
  used_days: number;
  balance_days: number;
  contract_anniversary?: Date;
  is_manual?: boolean;
  manual_justification?: string;
  person: {
    id: string;
    nome: string;
    cargo?: string;
    sub_time?: string;
    data_contrato?: string;
  };
}

const VacationManagement = () => {
  const { person } = useAuth();
  const { toast } = useToast();
  const [vacationData, setVacationData] = useState<VacationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<VacationData | null>(null);
  const [contractDate, setContractDate] = useState("");
  const [manualAccruedDays, setManualAccruedDays] = useState("");
  const [manualUsedDays, setManualUsedDays] = useState("");
  const [manualJustification, setManualJustification] = useState("");
  const [showMedicalLeaveForm, setShowMedicalLeaveForm] = useState(false);
  const [allPeople, setAllPeople] = useState<Person[]>([]);

  // Check if user is authorized (DIRETOR or ADMIN)
  if (!person || (person.papel !== 'DIRETOR' && !person.is_admin)) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    fetchVacationData();
  }, [selectedYear]);

  const fetchVacationData = async () => {
    setLoading(true);
    try {
      const [vacationBalances, peopleData] = await Promise.all([
        getAllVacationBalances(selectedYear),
        supabase.from('people').select('*').eq('ativo', true).order('nome')
      ]);
      
      setVacationData(vacationBalances);
      
      if (peopleData.data) {
        const mappedPeople: Person[] = peopleData.data.map(p => ({
          id: p.id,
          nome: p.nome,
          email: p.email,
          cargo: p.cargo,
          local: p.local,
          subTime: p.sub_time,
          papel: p.papel as any,
          is_admin: p.is_admin,
          ativo: p.ativo,
          gestorId: p.gestor_id,
          data_nascimento: p.data_nascimento,
          data_contrato: p.data_contrato
        }));
        setAllPeople(mappedPeople);
      }
    } catch (error) {
      console.error('Error fetching vacation data:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados de férias",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return vacationData.filter(item =>
      item.person.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.person.cargo && item.person.cargo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.person.sub_time && item.person.sub_time.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [vacationData, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: vacationData.length,
      withoutContract: vacationData.filter(item => !item.person.data_contrato).length,
      lowBalance: vacationData.filter(item => item.balance_days < 10).length,
      highBalance: vacationData.filter(item => item.balance_days > 20).length,
      manualBalances: vacationData.filter(item => item.is_manual).length,
    };
  }, [vacationData]);

  const handleEditContract = (item: VacationData) => {
    setSelectedPerson(item);
    setContractDate(item.person.data_contrato || "");
    setEditDialogOpen(true);
  };

  const handleEditBalance = (item: VacationData) => {
    setSelectedPerson(item);
    setManualAccruedDays(item.accrued_days.toString());
    setManualUsedDays(item.used_days.toString());
    setManualJustification(item.manual_justification || "");
    setBalanceDialogOpen(true);
  };

  const handleRestoreAutomatic = async (personId: string) => {
    try {
      const result = await deleteManualVacationBalance(personId, selectedYear);
      
      if (result.success) {
        toast({
          title: "Sucesso",
          description: "Cálculo automático restaurado com sucesso.",
        });
        fetchVacationData();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao restaurar cálculo automático.",
        variant: "destructive",
      });
    }
  };

  const handleSaveContract = async () => {
    if (!selectedPerson || !contractDate) return;

    try {
      const { error } = await supabase
        .from('people')
        .update({ data_contrato: contractDate })
        .eq('id', selectedPerson.person_id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Data de contrato atualizada com sucesso.",
      });
      
      setEditDialogOpen(false);
      fetchVacationData();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar data de contrato.",
        variant: "destructive",
      });
    }
  };

  const handleSaveManualBalance = async () => {
    if (!selectedPerson || !manualAccruedDays || !manualUsedDays || !manualJustification.trim()) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    const accruedDays = parseInt(manualAccruedDays);
    const usedDays = parseInt(manualUsedDays);

    if (isNaN(accruedDays) || isNaN(usedDays) || accruedDays < 0 || usedDays < 0) {
      toast({
        title: "Erro",
        description: "Os dias devem ser números válidos e não negativos.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await saveManualVacationBalance(
        selectedPerson.person_id,
        selectedYear,
        accruedDays,
        usedDays,
        manualJustification,
        person.id
      );

      if (result.success) {
        toast({
          title: "Sucesso",
          description: "Saldo manual salvo com sucesso.",
        });
        
        setBalanceDialogOpen(false);
        setManualAccruedDays("");
        setManualUsedDays("");
        setManualJustification("");
        fetchVacationData();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar saldo manual.",
        variant: "destructive",
      });
    }
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Nome', 'Cargo', 'Time', 'Data Contrato', 'Dias Adquiridos', 'Dias Usados', 'Saldo', 'Status'],
      ...filteredData.map(item => [
        item.person.nome,
        item.person.cargo || '',
        item.person.sub_time || '',
        item.person.data_contrato || '',
        item.accrued_days.toString(),
        item.used_days.toString(),
        item.balance_days.toString(),
        item.is_manual ? 'Manual' : 'Automático'
      ])
    ].map(row => row.join(',')).join('\\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `saldos_ferias_${selectedYear}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const getBalanceColor = (balance: number, hasContract: boolean) => {
    if (!hasContract) return "bg-red-100 text-red-800";
    if (balance < 10) return "bg-red-100 text-red-800";
    if (balance > 20) return "bg-yellow-100 text-yellow-800";
    return "bg-green-100 text-green-800";
  };

  const getBalanceIcon = (balance: number, hasContract: boolean) => {
    if (!hasContract) return <AlertTriangle className="h-4 w-4" />;
    if (balance < 10) return <AlertTriangle className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gestão de Recursos Humanos</h1>
            <p className="text-muted-foreground">Gerencie férias, licenças médicas e capacidade de times</p>
          </div>
        </div>

        <Tabs defaultValue="vacation" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="vacation">Saldos de Férias</TabsTrigger>
            <TabsTrigger value="medical">Licenças Médicas</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard Executivo</TabsTrigger>
          </TabsList>

          {/* Vacation Management Tab */}
          <TabsContent value="vacation" className="space-y-6">
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardContent className="flex items-center p-6">
                  <Users className="h-8 w-8 text-primary" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Total Colaboradores</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="flex items-center p-6">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Sem Data Contrato</p>
                    <p className="text-2xl font-bold">{stats.withoutContract}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Saldo Baixo (&lt;10)</p>
                    <p className="text-2xl font-bold">{stats.lowBalance}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <CalendarDays className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Saldo Alto (&gt;20)</p>
                    <p className="text-2xl font-bold">{stats.highBalance}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <Edit className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Saldos Manuais</p>
                    <p className="text-2xl font-bold">{stats.manualBalances}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Controls */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Gerenciamento de Saldos de Férias</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportToCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, cargo ou time..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Table */}
                {loading ? (
                  <div className="text-center py-8">Carregando dados...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Nome</TableHead>
                          <TableHead className="min-w-[150px]">Cargo</TableHead>
                          <TableHead className="min-w-[120px]">Time</TableHead>
                          <TableHead className="min-w-[120px]">Data Contrato</TableHead>
                          <TableHead className="min-w-[100px] text-center">Adquiridos</TableHead>
                          <TableHead className="min-w-[80px] text-center">Usados</TableHead>
                          <TableHead className="min-w-[80px] text-center">Saldo</TableHead>
                          <TableHead className="min-w-[100px] text-center">Status</TableHead>
                          <TableHead className="min-w-[140px] sticky right-0 bg-background text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredData.map((item) => (
                          <TableRow key={`${item.person_id}-${item.year}`}>
                            <TableCell className="font-medium">{item.person.nome}</TableCell>
                            <TableCell>{item.person.cargo || "N/A"}</TableCell>
                            <TableCell>{item.person.sub_time || "N/A"}</TableCell>
                            <TableCell>
                              {item.person.data_contrato ? (
                                format(new Date(item.person.data_contrato), "dd/MM/yyyy")
                              ) : (
                                <span className="text-red-600 text-sm">Não definida</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">{item.accrued_days}</TableCell>
                            <TableCell className="text-center">{item.used_days}</TableCell>
                            <TableCell className="text-center">
                              <Badge className={getBalanceColor(item.balance_days, !!item.person.data_contrato)}>
                                {getBalanceIcon(item.balance_days, !!item.person.data_contrato)}
                                <span className="ml-1">{item.balance_days}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {item.is_manual ? (
                                <Badge variant="secondary" className="text-xs">
                                  Manual
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  Auto
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="sticky right-0 bg-background">
                              <div className="flex gap-1 justify-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditContract(item)}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditBalance(item)}
                                >
                                  <CalendarDays className="h-3 w-3" />
                                </Button>
                                {item.is_manual && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRestoreAutomatic(item.person_id)}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Medical Leave Management Tab */}
          <TabsContent value="medical" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Licenças Médicas</h2>
              <Button onClick={() => setShowMedicalLeaveForm(true)}>
                Registrar Licença Médica
              </Button>
            </div>
            
            <MedicalLeaveList onRefresh={fetchVacationData} />
            
            {showMedicalLeaveForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <MedicalLeaveForm
                  people={allPeople}
                  onSuccess={() => {
                    setShowMedicalLeaveForm(false);
                    fetchVacationData();
                  }}
                  onCancel={() => setShowMedicalLeaveForm(false)}
                />
              </div>
            )}
          </TabsContent>

          {/* Executive Dashboard Tab */}
          <TabsContent value="dashboard">
            <TeamCapacityDashboard />
          </TabsContent>
        </Tabs>

        {/* Contract Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Data de Contrato</DialogTitle>
              <DialogDescription>
                Atualize a data de contrato para: <strong>{selectedPerson?.person.nome}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label htmlFor="contract-date" className="block text-sm font-medium mb-2">
                  Data de Contrato
                </label>
                <Input
                  id="contract-date"
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveContract}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manual Balance Dialog */}
        <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Saldo Manual</DialogTitle>
              <DialogDescription>
                Defina um saldo manual para: <strong>{selectedPerson?.person.nome}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="accrued-days" className="block text-sm font-medium mb-2">
                    Dias Adquiridos
                  </label>
                  <Input
                    id="accrued-days"
                    type="number"
                    min="0"
                    value={manualAccruedDays}
                    onChange={(e) => setManualAccruedDays(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="used-days" className="block text-sm font-medium mb-2">
                    Dias Usados
                  </label>
                  <Input
                    id="used-days"
                    type="number"
                    min="0"
                    value={manualUsedDays}
                    onChange={(e) => setManualUsedDays(e.target.value)}
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="justification" className="block text-sm font-medium mb-2">
                  Justificativa <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="justification"
                  className="w-full p-3 border rounded-md resize-none"
                  rows={3}
                  value={manualJustification}
                  onChange={(e) => setManualJustification(e.target.value)}
                  placeholder="Descreva o motivo da alteração manual..."
                />
              </div>

              <div className="text-xs text-muted-foreground bg-yellow-50 p-2 rounded">
                <strong>Atenção:</strong> Esta ação sobrescreverá o cálculo automático. O saldo será marcado como "Manual" até ser restaurado.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveManualBalance}>
                Salvar Saldo Manual
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default VacationManagement;