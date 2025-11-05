import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAllVacationBalances, saveManualVacationBalance, deleteManualVacationBalance, recalculateVacationBalance } from "@/lib/vacationUtils";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, useSearchParams } from "react-router-dom";
import { Person, ModeloContrato, MODELO_CONTRATO_LABELS } from "@/lib/types";
import { Header } from "@/components/Header";
import { MedicalLeaveForm } from "@/components/MedicalLeaveForm";
import { MedicalLeaveList } from "@/components/MedicalLeaveList";

import { TeamCapacityDashboard } from "@/components/TeamCapacityDashboard";
import { ApprovedVacationsExecutiveView } from "@/components/ApprovedVacationsExecutiveView";
import { ActiveAbsencesDashboard } from "@/components/ActiveAbsencesDashboard";
import { HistoricalRequestForm } from "@/components/HistoricalRequestForm";
import { SheetsSync } from "@/components/SheetsSync";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
  History,
  Calculator,
  Loader2,
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
    modelo_contrato?: string;
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
  const [contractModel, setContractModel] = useState<ModeloContrato>(ModeloContrato.CLT);
  const [maternityExtensionDays, setMaternityExtensionDays] = useState<number>(0);
  const [manualAccruedDays, setManualAccruedDays] = useState("");
  const [manualUsedDays, setManualUsedDays] = useState("");
  const [manualJustification, setManualJustification] = useState("");
  const [showMedicalLeaveForm, setShowMedicalLeaveForm] = useState(false);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [massRecalculateOpen, setMassRecalculateOpen] = useState(false);
  const [massRecalculateJustification, setMassRecalculateJustification] = useState("");
  const [massRecalculateLoading, setMassRecalculateLoading] = useState(false);
  const [massRecalculateProgress, setMassRecalculateProgress] = useState(0);
  const [contractTypeFilter, setContractTypeFilter] = useState<string>("all");
  
  // Get tab from URL query params
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'vacation';

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
          data_contrato: p.data_contrato,
          modelo_contrato: p.modelo_contrato as any
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
    return vacationData.filter(item => {
      const matchesSearch = item.person.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.person.cargo && item.person.cargo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.person.sub_time && item.person.sub_time.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesContractType = contractTypeFilter === "all" || 
        item.person.modelo_contrato === contractTypeFilter ||
        (!item.person.modelo_contrato && contractTypeFilter === "CLT");
      
      return matchesSearch && matchesContractType;
    });
  }, [vacationData, searchTerm, contractTypeFilter]);

  const stats = useMemo(() => {
    const contractTypeCounts = vacationData.reduce((acc, item) => {
      const contractType = item.person.modelo_contrato || 'CLT';
      acc[contractType] = (acc[contractType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: vacationData.length,
      withoutContract: vacationData.filter(item => !item.person.data_contrato).length,
      accumulatedVacations: vacationData.filter(item => item.balance_days > 30).length,
      manualBalances: vacationData.filter(item => item.is_manual).length,
      contractTypeCounts,
    };
  }, [vacationData]);

  const handleEditContract = (item: VacationData) => {
    setSelectedPerson(item);
    setContractDate(item.person.data_contrato || "");
    setContractModel(item.person.modelo_contrato as ModeloContrato || ModeloContrato.CLT);
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
    if (!selectedPerson) return;

    const updateData: any = {};
    const originalContractDate = selectedPerson.person.data_contrato || "";
    const originalContractModel = selectedPerson.person.modelo_contrato || ModeloContrato.CLT;
    const originalMaternityExtension = (selectedPerson.person as any).maternity_extension_days || 0;

    // Check what fields have changed
    if (contractDate !== originalContractDate) {
      updateData.data_contrato = contractDate || null;
    }

    if (contractModel !== originalContractModel) {
      updateData.modelo_contrato = contractModel;
    }
    
    if (maternityExtensionDays !== originalMaternityExtension) {
      updateData.maternity_extension_days = maternityExtensionDays;
    }

    // Only proceed if there are changes
    if (Object.keys(updateData).length === 0) {
      toast({
        title: "Informação",
        description: "Nenhuma alteração foi feita.",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('people')
        .update(updateData)
        .eq('id', selectedPerson.person_id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Dados de contrato atualizados com sucesso.",
      });
      
      setEditDialogOpen(false);
      fetchVacationData();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar dados de contrato.",
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

  const handleMassRecalculate = async () => {
    if (!massRecalculateJustification.trim()) {
      toast({
        title: "Erro",
        description: "Justificativa é obrigatória para recálculo em massa.",
        variant: "destructive",
      });
      return;
    }

    setMassRecalculateLoading(true);
    setMassRecalculateProgress(0);
    
    const itemsToProcess = filteredData.length;
    let processed = 0;
    let successful = 0;
    let failed = 0;

    try {
      for (const item of filteredData) {
        try {
          const result = await recalculateVacationBalance(
            item.person_id,
            selectedYear,
            massRecalculateJustification.trim(),
            person.id
          );

          if (result.success) {
            successful++;
          } else {
            failed++;
            console.error(`Erro ao recalcular ${item.person.nome}:`, result.error);
          }
        } catch (error) {
          failed++;
          console.error(`Erro ao recalcular ${item.person.nome}:`, error);
        }
        
        processed++;
        setMassRecalculateProgress(Math.round((processed / itemsToProcess) * 100));
      }

      toast({
        title: "Recálculo Concluído",
        description: `${successful} saldo(s) recalculado(s) com sucesso. ${failed > 0 ? `${failed} erro(s).` : ''}`,
        variant: successful > 0 ? "default" : "destructive",
      });

      setMassRecalculateOpen(false);
      setMassRecalculateJustification("");
      fetchVacationData();
    } catch (error) {
      console.error("Erro no recálculo em massa:", error);
      toast({
        title: "Erro",
        description: "Erro interno no recálculo em massa.",
        variant: "destructive",
      });
    } finally {
      setMassRecalculateLoading(false);
      setMassRecalculateProgress(0);
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

  const getContractBadgeVariant = (contractType?: string) => {
    switch (contractType) {
      case 'PJ': return 'secondary';
      case 'CLT_ABONO_LIVRE': return 'default';
      case 'CLT_ABONO_FIXO': return 'outline';
      default: return 'default';
    }
  };

  const getAbonoInfo = (contractType?: string) => {
    switch (contractType) {
      case 'PJ': return 'Não aplicável';
      case 'CLT_ABONO_LIVRE': return '1-10 dias';
      case 'CLT_ABONO_FIXO': return '0 ou 10 dias';
      default: return 'Padrão CLT';
    }
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

        <Tabs defaultValue={initialTab} className="w-full">
          {/* Mobile: ScrollArea horizontal */}
          <div className="block lg:hidden">
            <ScrollArea className="w-full whitespace-nowrap">
              <TabsList className="inline-flex w-max">
                <TabsTrigger value="vacation">Saldos de Férias</TabsTrigger>
                <TabsTrigger value="medical">Licenças Médicas</TabsTrigger>
                <TabsTrigger value="active">Ausências Ativas</TabsTrigger>
                <TabsTrigger value="dashboard">Dashboard Executivo</TabsTrigger>
                <TabsTrigger value="historical" className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Regularização
                </TabsTrigger>
                <TabsTrigger value="sheets">Google Sheets</TabsTrigger>
              </TabsList>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          
          {/* Desktop: Grid layout */}
          <div className="hidden lg:block">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="vacation">Saldos de Férias</TabsTrigger>
              <TabsTrigger value="medical">Licenças Médicas</TabsTrigger>
              <TabsTrigger value="active">Ausências Ativas</TabsTrigger>
              <TabsTrigger value="dashboard">Dashboard Executivo</TabsTrigger>
              <TabsTrigger value="historical" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Regularização
              </TabsTrigger>
              <TabsTrigger value="sheets">Google Sheets</TabsTrigger>
            </TabsList>
          </div>

          {/* Vacation Management Tab */}
          <TabsContent value="vacation" className="space-y-6">
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
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
                  <CalendarDays className="h-8 w-8 text-amber-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Férias Acumuladas (&gt;30)</p>
                    <p className="text-2xl font-bold">{stats.accumulatedVacations}</p>
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

              <Card>
                <CardContent className="flex items-center p-6">
                  <Users className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">CLT Abono Livre</p>
                    <p className="text-2xl font-bold">{stats.contractTypeCounts['CLT_ABONO_LIVRE'] || 0}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <Users className="h-8 w-8 text-orange-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">CLT Abono Fixo</p>
                    <p className="text-2xl font-bold">{stats.contractTypeCounts['CLT_ABONO_FIXO'] || 0}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Controls */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Gerenciamento de Saldos de Férias</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMassRecalculateOpen(true)}>
                    <Calculator className="h-4 w-4 mr-2" />
                    Recalcular Saldos
                  </Button>
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
                    <Select value={contractTypeFilter} onValueChange={setContractTypeFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filtrar por contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Contratos</SelectItem>
                        {Object.values(ModeloContrato).map((tipo) => (
                          <SelectItem key={tipo} value={tipo}>
                            {MODELO_CONTRATO_LABELS[tipo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                            <TableHead className="min-w-[150px]">Modelo Contrato</TableHead>
                            <TableHead className="min-w-[130px]">Tipo de Abono</TableHead>
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
                         {filteredData.map((item) => {
                           const isPJWithAccumulatedVacations = item.person.modelo_contrato === 'PJ' && item.balance_days > 30;
                           
                           return (
                              <TableRow 
                                key={`${item.person_id}-${item.year}`}
                                className={isPJWithAccumulatedVacations ? "bg-amber-50 dark:bg-amber-950 border-l-4 border-l-amber-400 dark:border-l-amber-600" : ""}
                              >
                               <TableCell className="font-medium">
                                 <div className="flex items-center space-x-2">
                                   {item.person.nome}
                                   {isPJWithAccumulatedVacations && (
                                      <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950 text-xs">
                                        Férias Acumuladas
                                      </Badge>
                                   )}
                                 </div>
                               </TableCell>
                                <TableCell>
                                  <Badge variant={getContractBadgeVariant(item.person.modelo_contrato)}>
                                    {MODELO_CONTRATO_LABELS[item.person.modelo_contrato as ModeloContrato] || MODELO_CONTRATO_LABELS[ModeloContrato.CLT]}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-muted-foreground">
                                    {getAbonoInfo(item.person.modelo_contrato)}
                                  </span>
                                </TableCell>
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
                           );
                         })}
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

          {/* Active Absences Tab */}
          <TabsContent value="active" className="space-y-6">
            <ActiveAbsencesDashboard />
          </TabsContent>

          {/* Executive Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <Tabs defaultValue="capacity" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="capacity">Capacidade de Times</TabsTrigger>
                <TabsTrigger value="vacations">Férias Aprovadas</TabsTrigger>
              </TabsList>
              
              <TabsContent value="capacity" className="mt-6">
                <TeamCapacityDashboard />
              </TabsContent>
              
              <TabsContent value="vacations" className="mt-6">
                <ApprovedVacationsExecutiveView />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Historical Requests Tab */}
          <TabsContent value="historical" className="space-y-6">
            <div className="bg-card rounded-lg p-6 shadow-sm">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-foreground">Regularização Histórica</h3>
                <p className="text-sm text-muted-foreground">
                  Registre solicitações históricas que foram processadas por outros canais
                </p>
              </div>
              <HistoricalRequestForm onSuccess={() => {}} />
            </div>
          </TabsContent>

          {/* Google Sheets Sync Tab */}
          <TabsContent value="sheets">
            <SheetsSync />
          </TabsContent>
        </Tabs>

        {/* Contract Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Dados de Contrato</DialogTitle>
              <DialogDescription>
                Atualize os dados de contrato para: <strong>{selectedPerson?.person.nome}</strong>
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
               <div>
                 <label htmlFor="contract-model" className="block text-sm font-medium mb-2">
                   Modelo de Contrato
                 </label>
                 <Select value={contractModel} onValueChange={(value) => setContractModel(value as ModeloContrato)}>
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     {Object.values(ModeloContrato).map((modelo) => (
                       <SelectItem key={modelo} value={modelo}>
                         <div className="flex flex-col">
                           <span>{MODELO_CONTRATO_LABELS[modelo]}</span>
                           <span className="text-xs text-muted-foreground">
                             Abono: {getAbonoInfo(modelo)}
                           </span>
                         </div>
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 <div className="text-xs text-muted-foreground mt-1">
                   {contractModel === 'CLT_ABONO_LIVRE' && "Permite venda de 1 a 10 dias de férias"}
                   {contractModel === 'CLT_ABONO_FIXO' && "Permite venda de 0 ou 10 dias (valor fixo)"}
                   {contractModel === 'PJ' && "Pessoa Jurídica não tem direito a abono de férias"}
                   {contractModel === 'CLT' && "CLT padrão sem abono de férias"}
                 </div>
               </div>
               <div>
                 <label htmlFor="maternity-extension" className="block text-sm font-medium mb-2">
                   Extensão Licença Maternidade (dias além de 120)
                 </label>
                 <Input
                   id="maternity-extension"
                   type="number"
                   min="0"
                   max="60"
                   value={maternityExtensionDays}
                   onChange={(e) => setMaternityExtensionDays(parseInt(e.target.value) || 0)}
                 />
                 <div className="text-xs text-muted-foreground mt-1">
                   Dias adicionais além dos 120 dias da CLT (Máx: 60 dias)
                 </div>
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

        {/* Mass Recalculate Dialog */}
        <Dialog open={massRecalculateOpen} onOpenChange={setMassRecalculateOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Recalcular Saldos em Massa</DialogTitle>
              <DialogDescription>
                Recalcular automaticamente os saldos de férias para todos os {filteredData.length} colaborador(es) exibido(s) na lista atual.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded">
                <strong>Atenção:</strong> Esta operação irá:
                <ul className="list-disc ml-4 mt-2">
                  <li>Recalcular baseado na data de contrato e solicitações aprovadas</li>
                  <li>Sobrescrever saldos manuais existentes</li>
                  <li>Aplicar a mesma justificativa para todos os registros</li>
                </ul>
              </div>
              
              <div>
                <label htmlFor="mass-justification" className="block text-sm font-medium mb-2">
                  Justificativa para Recálculo <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="mass-justification"
                  className="w-full p-3 border rounded-md resize-none"
                  rows={3}
                  value={massRecalculateJustification}
                  onChange={(e) => setMassRecalculateJustification(e.target.value)}
                  placeholder="Ex: Recálculo em massa após inclusão de solicitações históricas..."
                  disabled={massRecalculateLoading}
                />
              </div>

              {massRecalculateLoading && (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Progresso: {massRecalculateProgress}%
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${massRecalculateProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setMassRecalculateOpen(false);
                  setMassRecalculateJustification("");
                }}
                disabled={massRecalculateLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleMassRecalculate}
                disabled={massRecalculateLoading || !massRecalculateJustification.trim()}
              >
                {massRecalculateLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Recalculando...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4 mr-2" />
                    Recalcular {filteredData.length} Saldo(s)
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default VacationManagement;