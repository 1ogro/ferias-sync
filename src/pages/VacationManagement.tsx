import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getAllVacationBalances } from "@/lib/vacationUtils";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
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
  TableRow
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Calendar,
  Download,
  Edit,
  Search,
  Users,
  AlertTriangle,
  CalendarDays,
  CheckCircle
} from "lucide-react";

interface VacationData {
  person_id: string;
  year: number;
  accrued_days: number;
  used_days: number;
  balance_days: number;
  contract_anniversary: Date;
  person: {
    id: string;
    nome: string;
    email: string;
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
  const [selectedPerson, setSelectedPerson] = useState<VacationData | null>(null);
  const [contractDate, setContractDate] = useState("");

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
      const data = await getAllVacationBalances(selectedYear);
      setVacationData(data);
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
      item.person.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.person.cargo && item.person.cargo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.person.sub_time && item.person.sub_time.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [vacationData, searchTerm]);

  const stats = useMemo(() => {
    const total = vacationData.length;
    const withoutContract = vacationData.filter(item => !item.person.data_contrato).length;
    const lowBalance = vacationData.filter(item => item.balance_days < 10 && item.person.data_contrato).length;
    const highBalance = vacationData.filter(item => item.balance_days > 20).length;
    const totalBalance = vacationData.reduce((sum, item) => sum + item.balance_days, 0);

    return {
      total,
      withoutContract,
      lowBalance,
      highBalance,
      averageBalance: total > 0 ? Math.round(totalBalance / total) : 0
    };
  }, [vacationData]);

  const handleEditContract = (item: VacationData) => {
    setSelectedPerson(item);
    setContractDate(item.person.data_contrato || "");
    setEditDialogOpen(true);
  };

  const handleSaveContract = async () => {
    if (!selectedPerson || !contractDate) return;

    try {
      const { error } = await supabase
        .from('people')
        .update({ data_contrato: contractDate })
        .eq('id', selectedPerson.person.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Data de contrato atualizada com sucesso!",
      });

      setEditDialogOpen(false);
      setSelectedPerson(null);
      setContractDate("");
      fetchVacationData();
    } catch (error) {
      console.error('Error updating contract date:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar data de contrato",
        variant: "destructive",
      });
    }
  };

  const exportToCSV = () => {
    const headers = ['Nome', 'Email', 'Cargo', 'Sub Time', 'Data Contrato', 'Dias Acumulados', 'Dias Usados', 'Saldo'];
    const csvContent = [
      headers.join(','),
      ...filteredData.map(item =>
        [
          `"${item.person.nome}"`,
          item.person.email,
          `"${item.person.cargo || ''}"`,
          `"${item.person.sub_time || ''}"`,
          item.person.data_contrato || '',
          item.accrued_days,
          item.used_days,
          item.balance_days
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `saldos_ferias_${selectedYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBalanceColor = (balance: number, hasContract: boolean) => {
    if (!hasContract) return "bg-gray-100 text-gray-800";
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
            <h1 className="text-3xl font-bold">Gestão de Férias</h1>
            <p className="text-muted-foreground">Visualize e gerencie os saldos de férias de toda a equipe</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </div>

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
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Saldo Médio</p>
                <p className="text-2xl font-bold">{stats.averageBalance} dias</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome, email, cargo ou time..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2023">2023</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Saldos de Férias {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-lg">Carregando...</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Data Contrato</TableHead>
                      <TableHead className="text-center">Acumulados</TableHead>
                      <TableHead className="text-center">Usados</TableHead>
                      <TableHead className="text-center">Saldo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item) => (
                      <TableRow key={item.person.id}>
                        <TableCell className="font-medium">{item.person.nome}</TableCell>
                        <TableCell>{item.person.email}</TableCell>
                        <TableCell>{item.person.cargo || "—"}</TableCell>
                        <TableCell>{item.person.sub_time || "—"}</TableCell>
                        <TableCell>
                          {item.person.data_contrato 
                            ? new Date(item.person.data_contrato).toLocaleDateString("pt-BR")
                            : "—"
                          }
                        </TableCell>
                        <TableCell className="text-center">{item.accrued_days}</TableCell>
                        <TableCell className="text-center">{item.used_days}</TableCell>
                        <TableCell className="text-center font-bold">{item.balance_days}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={getBalanceColor(item.balance_days, !!item.person.data_contrato)}
                          >
                            <div className="flex items-center gap-1">
                              {getBalanceIcon(item.balance_days, !!item.person.data_contrato)}
                              {!item.person.data_contrato ? "Sem contrato" :
                               item.balance_days < 10 ? "Baixo" :
                               item.balance_days > 20 ? "Alto" : "Normal"}
                            </div>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditContract(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Contract Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Data de Contrato</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Editando: <strong>{selectedPerson?.person.nome}</strong>
                </p>
                <Input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  placeholder="Data de contrato"
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
      </div>
    </div>
  );
};

export default VacationManagement;