import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Person, Papel } from "@/lib/types";
import { cn, canEditUser, canPromoteToDirector, canEditAdminPermission } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Tooltip,
  TooltipContent, 
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Filter, 
  X, 
  Download,
  Upload,
  Users,
  UserCheck,
  UserX,
  ChevronUp,
  ChevronDown,
  History
} from "lucide-react";

interface FormData {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  local: string;
  subTime: string;
  papel: Papel;
  is_admin: boolean;
  ativo: boolean;
  gestorId: string;
  data_contrato: string;
}

interface FilterState {
  search: string;
  papel: string;
  ativo: string;
  local: string;
  cargo: string;
}

type SortField = 'nome' | 'email' | 'cargo' | 'local' | 'papel' | 'is_admin' | 'ativo';
type SortDirection = 'asc' | 'desc';

const Admin = () => {
  const { person } = useAuth();
  const { toast } = useToast();
  
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
   const [formData, setFormData] = useState<FormData>({
     id: '',
     nome: '',
     email: '',
     cargo: '',
     local: '',
     subTime: '',
     papel: Papel.COLABORADOR,
     is_admin: false,
     ativo: true,
     gestorId: '',
     data_contrato: ''
   });

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    papel: '',
    ativo: '',
    local: '',
    cargo: ''
  });

  const [sortField, setSortField] = useState<SortField>('nome');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);

  // Statistics
  const stats = useMemo(() => {
    const total = people.length;
    const active = people.filter(p => p.ativo).length;
    const inactive = total - active;
    const byRole = Object.values(Papel).reduce((acc, role) => {
      acc[role] = people.filter(p => p.papel === role).length;
      return acc;
    }, {} as Record<Papel, number>);

    return { total, active, inactive, byRole };
  }, [people]);

  // Filtered and sorted data
  const filteredAndSortedPeople = useMemo(() => {
    let filtered = people.filter(person => {
      const matchesSearch = !filters.search || 
        person.nome.toLowerCase().includes(filters.search.toLowerCase()) ||
        person.email.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesPapel = !filters.papel || person.papel === filters.papel;
      const matchesAtivo = !filters.ativo || person.ativo.toString() === filters.ativo;
      const matchesLocal = !filters.local || (person.local && person.local.toLowerCase().includes(filters.local.toLowerCase()));
      const matchesCargo = !filters.cargo || (person.cargo && person.cargo.toLowerCase().includes(filters.cargo.toLowerCase()));

      return matchesSearch && matchesPapel && matchesAtivo && matchesLocal && matchesCargo;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue = a[sortField] || '';
      let bValue = b[sortField] || '';
      
      if (typeof aValue === 'boolean') {
        aValue = aValue ? 'Ativo' : 'Inativo';
        bValue = bValue ? 'Ativo' : 'Inativo';
      }
      
      const comparison = aValue.toString().localeCompare(bValue.toString());
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [people, filters, sortField, sortDirection]);

  useEffect(() => {
    fetchPeople();
  }, []);

  if (!person || !person.is_admin) {
    return <Navigate to="/" replace />;
  }

  const fetchPeople = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .order('nome', { ascending: true });

      if (error) throw error;
      setPeople((data || []).map(person => ({
        ...person,
        papel: person.papel as Papel,
        gestorId: person.gestor_id,
        subTime: person.sub_time,
        modelo_contrato: person.modelo_contrato as any
      })));
    } catch (error) {
      console.error('Erro ao buscar pessoas:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar lista de pessoas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const data = {
        id: formData.id,
        nome: formData.nome,
        email: formData.email,
        cargo: formData.cargo || null,
        local: formData.local || null,
        sub_time: formData.subTime || null,
        papel: formData.papel,
        is_admin: formData.is_admin,
        ativo: formData.ativo,
        gestor_id: formData.gestorId || null,
        data_contrato: formData.data_contrato || null
      };

      if (isEditing) {
        const { error } = await supabase
          .from('people')
          .update(data)
          .eq('id', formData.id);

        if (error) throw error;
        
        toast({
          title: "Sucesso",
          description: "Pessoa atualizada com sucesso!",
        });
      } else {
        const { error } = await supabase
          .from('people')
          .insert([data]);

        if (error) throw error;
        
        toast({
          title: "Sucesso",
          description: "Pessoa criada com sucesso!",
        });
      }

      resetForm();
      fetchPeople();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar pessoa",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (person: Person) => {
     setFormData({
       id: person.id,
       nome: person.nome,
       email: person.email,
       cargo: person.cargo || '',
       local: person.local || '',
       subTime: person.subTime || '',
       papel: person.papel,
       is_admin: person.is_admin,
       ativo: person.ativo,
       gestorId: person.gestorId || '',
       data_contrato: person.data_contrato || ''
     });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('people')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Pessoa excluída com sucesso!",
      });
      
      fetchPeople();
    } catch (error: any) {
      console.error('Erro ao excluir:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao excluir pessoa",
        variant: "destructive",
      });
    }
    setDeleteId(null);
  };

  const resetForm = () => {
    setFormData({
      id: '',
      nome: '',
      email: '',
      cargo: '',
      local: '',
      subTime: '',
      papel: Papel.COLABORADOR,
      is_admin: false,
      ativo: true,
      gestorId: '',
      data_contrato: ''
    });
    setIsEditing(false);
    setIsDialogOpen(false);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      papel: '',
      ativo: '',
      local: '',
      cargo: ''
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getPapelColor = (papel: Papel) => {
    switch (papel) {
      case Papel.DIRETOR: return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case Papel.GESTOR: return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case Papel.COLABORADOR: return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </TableHead>
  );

  const exportToCSV = () => {
    const headers = ['ID', 'Nome', 'Email', 'Cargo', 'Local', 'Sub Time', 'Papel', 'Ativo', 'Gestor ID'];
    const csvContent = [
      headers.join(','),
      ...filteredAndSortedPeople.map(person => 
        [
          person.id,
          `"${person.nome}"`,
          person.email,
          `"${person.cargo || ''}"`,
          `"${person.local || ''}"`,
          `"${person.subTime || ''}"`,
          person.papel,
          person.ativo,
          person.gestorId || ''
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `pessoas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper function to check if user has approval role
  const hasApprovalRole = (person: Person | null): boolean => {
    if (!person) return false;
    return ['COLABORADOR', 'GESTOR', 'DIRETOR'].includes(person.papel);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header showNavigation={hasApprovalRole(person)} />
      <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Administração de Usuários</h1>
          <p className="text-muted-foreground">Gerencie todos os usuários do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button 
            onClick={() => window.location.href = '/admin/historical-requests'} 
            variant="outline" 
            size="sm"
          >
            <History className="h-4 w-4 mr-2" />
            Cadastro Histórico
          </Button>
          <Button onClick={() => setIsDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <Users className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <UserCheck className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Ativos</p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-6">
            <UserX className="h-8 w-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-muted-foreground">Inativos</p>
              <p className="text-2xl font-bold">{stats.inactive}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <div className="grid grid-cols-2 gap-2 text-xs w-full">
              {Object.entries(stats.byRole).map(([role, count]) => (
                <div key={role} className="flex justify-between">
                  <span className="text-muted-foreground">{role}:</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="w-full sm:w-auto"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
              {(filters.search || filters.papel || filters.ativo || filters.local || filters.cargo) && (
                <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
                  <X className="h-4 w-4 mr-2" />
                  Limpar
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
                <Select value={filters.papel} onValueChange={(value) => setFilters({ ...filters, papel: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por papel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os papéis</SelectItem>
                    {Object.values(Papel).map(papel => (
                      <SelectItem key={papel} value={papel}>{papel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filters.ativo} onValueChange={(value) => setFilters({ ...filters, ativo: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Filtrar por local"
                  value={filters.local}
                  onChange={(e) => setFilters({ ...filters, local: e.target.value })}
                />

                <Input
                  placeholder="Filtrar por cargo"
                  value={filters.cargo}
                  onChange={(e) => setFilters({ ...filters, cargo: e.target.value })}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Mostrando {filteredAndSortedPeople.length} de {people.length} usuários
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                 <TableRow>
                   <SortableHeader field="nome">Nome</SortableHeader>
                   <SortableHeader field="email">Email</SortableHeader>
                   <SortableHeader field="cargo">Cargo</SortableHeader>
                   <SortableHeader field="local">Local</SortableHeader>
                   <SortableHeader field="papel">Papel</SortableHeader>
                   <SortableHeader field="is_admin">Admin</SortableHeader>
                   <SortableHeader field="ativo">Status</SortableHeader>
                   <TableHead>Ações</TableHead>
                 </TableRow>
              </TableHeader>
              <TableBody>
                 {filteredAndSortedPeople.map((targetPerson) => (
                   <TableRow key={targetPerson.id}>
                     <TableCell className="font-medium">{targetPerson.nome}</TableCell>
                     <TableCell>{targetPerson.email}</TableCell>
                     <TableCell>{targetPerson.cargo || '-'}</TableCell>
                     <TableCell>{targetPerson.local || '-'}</TableCell>
                     <TableCell>
                       <Badge className={getPapelColor(targetPerson.papel)}>
                         {targetPerson.papel}
                       </Badge>
                     </TableCell>
                     <TableCell>
                       <Badge variant={targetPerson.is_admin ? "default" : "secondary"}>
                         {targetPerson.is_admin ? "Sim" : "Não"}
                       </Badge>
                     </TableCell>
                     <TableCell>
                       <Badge variant={targetPerson.ativo ? "default" : "secondary"}>
                         {targetPerson.ativo ? "Ativo" : "Inativo"}
                       </Badge>
                     </TableCell>
                     <TableCell>
                       <div className="flex gap-2">
                         <TooltipProvider>
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => handleEdit(targetPerson)}
                                 disabled={!canEditUser(person, targetPerson)}
                               >
                                 <Edit className="h-4 w-4" />
                               </Button>
                             </TooltipTrigger>
                             {!canEditUser(person, targetPerson) && (
                               <TooltipContent>
                                 <p>Apenas DIRETOREs podem editar outros DIRETOREs</p>
                               </TooltipContent>
                             )}
                           </Tooltip>
                         </TooltipProvider>
                         
                         <AlertDialog>
                           <TooltipProvider>
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <AlertDialogTrigger asChild>
                                   <Button 
                                     variant="outline" 
                                     size="sm"
                                     disabled={!canEditUser(person, targetPerson)}
                                   >
                                     <Trash2 className="h-4 w-4" />
                                   </Button>
                                 </AlertDialogTrigger>
                               </TooltipTrigger>
                               {!canEditUser(person, targetPerson) && (
                                 <TooltipContent>
                                   <p>Apenas DIRETOREs podem excluir outros DIRETOREs</p>
                                 </TooltipContent>
                               )}
                             </Tooltip>
                           </TooltipProvider>
                           <AlertDialogContent>
                             <AlertDialogHeader>
                               <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                               <AlertDialogDescription>
                                 Tem certeza que deseja excluir {targetPerson.nome}? Esta ação não pode ser desfeita.
                               </AlertDialogDescription>
                             </AlertDialogHeader>
                             <AlertDialogFooter>
                               <AlertDialogCancel>Cancelar</AlertDialogCancel>
                               <AlertDialogAction onClick={() => handleDelete(targetPerson.id)}>
                                 Excluir
                               </AlertDialogAction>
                             </AlertDialogFooter>
                           </AlertDialogContent>
                         </AlertDialog>
                       </div>
                     </TableCell>
                   </TableRow>
                 ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogDescription>
              {isEditing ? 'Edite as informações do usuário.' : 'Adicione um novo usuário ao sistema.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="id">ID *</Label>
                <Input
                  id="id"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  required
                  disabled={isEditing}
                />
              </div>

              <div>
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="cargo">Cargo</Label>
                <Input
                  id="cargo"
                  value={formData.cargo}
                  onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="local">Local</Label>
                <Input
                  id="local"
                  value={formData.local}
                  onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="subTime">Sub Time</Label>
                <Input
                  id="subTime"
                  value={formData.subTime}
                  onChange={(e) => setFormData({ ...formData, subTime: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="data_contrato">Data de Contrato</Label>
                <Input
                  id="data_contrato"
                  type="date"
                  value={formData.data_contrato}
                  onChange={(e) => setFormData({ ...formData, data_contrato: e.target.value })}
                  disabled={!person?.is_admin}
                  title={!person?.is_admin ? "Apenas administradores podem editar datas de contrato" : ""}
                />
                {!person?.is_admin && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Apenas administradores podem editar datas de contrato
                  </p>
                )}
              </div>

               <div>
                 <Label htmlFor="papel">Papel *</Label>
                 <Select 
                   value={formData.papel} 
                   onValueChange={(value: Papel) => setFormData({ ...formData, papel: value })}
                 >
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     {Object.values(Papel).map(papel => (
                       <SelectItem 
                         key={papel} 
                         value={papel}
                         disabled={papel === "DIRETOR" && !canPromoteToDirector(person)}
                       >
                         {papel}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>

               <div>
                 <Label htmlFor="is_admin">Permissões de Admin</Label>
                 <Select 
                   value={formData.is_admin?.toString() || 'false'} 
                   onValueChange={(value) => setFormData({ ...formData, is_admin: value === 'true' })}
                   disabled={isEditing && !canEditAdminPermission(person, people.find(p => p.id === formData.id) || { papel: formData.papel, id: formData.id } as Person)}
                 >
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="false">Não</SelectItem>
                     <SelectItem value="true">Sim</SelectItem>
                   </SelectContent>
                 </Select>
               </div>

               <div>
                 <Label htmlFor="ativo">Status *</Label>
                <Select 
                  value={formData.ativo.toString()} 
                  onValueChange={(value) => setFormData({ ...formData, ativo: value === 'true' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="gestorId">Gestor ID</Label>
                 <Select 
                  value={formData.gestorId || "none"} 
                  onValueChange={(value) => setFormData({ ...formData, gestorId: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar gestor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum gestor</SelectItem>
                     {people
                       .filter(p => p.papel === Papel.GESTOR || p.papel === Papel.DIRETOR)
                       .filter(p => p.id !== formData.id)
                       .map(gestor => (
                         <SelectItem key={gestor.id} value={gestor.id}>
                           {gestor.nome} ({gestor.papel})
                         </SelectItem>
                       ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : (isEditing ? 'Atualizar' : 'Criar')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default Admin;