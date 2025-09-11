import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Papel, Person } from '@/lib/types';
import { Users, UserPlus, Edit, Trash2, Shield } from 'lucide-react';

export default function Admin() {
  const { person } = useAuth();
  const { toast } = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cargo: '',
    local: '',
    subTime: '',
    papel: Papel.COLABORADOR,
    gestorId: '',
    ativo: true
  });

  useEffect(() => {
    if (person?.papel !== 'ADMIN') {
      window.location.href = '/';
      return;
    }
    fetchPeople();
  }, [person]);

  const fetchPeople = async () => {
    try {
      const { data } = await supabase
        .from('people')
        .select('*')
        .order('nome');
      
      if (data) {
        setPeople(data as Person[]);
      }
    } catch (error) {
      console.error('Error fetching people:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pessoas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingPerson) {
        const { error } = await supabase
          .from('people')
          .update({
            nome: formData.nome,
            email: formData.email,
            cargo: formData.cargo,
            local: formData.local,
            sub_time: formData.subTime,
            papel: formData.papel,
            gestor_id: formData.gestorId || null,
            ativo: formData.ativo
          })
          .eq('id', editingPerson.id);

        if (error) throw error;
        
        toast({
          title: 'Sucesso',
          description: 'Pessoa atualizada com sucesso.',
        });
      } else {
        const { error } = await supabase
          .from('people')
          .insert({
            id: `person_${Date.now()}`,
            nome: formData.nome,
            email: formData.email,
            cargo: formData.cargo,
            local: formData.local,
            sub_time: formData.subTime,
            papel: formData.papel,
            gestor_id: formData.gestorId || null,
            ativo: formData.ativo
          });

        if (error) throw error;
        
        toast({
          title: 'Sucesso',
          description: 'Pessoa criada com sucesso.',
        });
      }
      
      resetForm();
      fetchPeople();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (person: Person) => {
    setEditingPerson(person);
    setFormData({
      nome: person.nome,
      email: person.email,
      cargo: person.cargo || '',
      local: person.local || '',
      subTime: person.subTime || '',
      papel: person.papel as Papel,
      gestorId: person.gestorId || '',
      ativo: person.ativo
    });
  };

  const handleDelete = async (personId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta pessoa?')) return;
    
    try {
      const { error } = await supabase
        .from('people')
        .delete()
        .eq('id', personId);

      if (error) throw error;
      
      toast({
        title: 'Sucesso',
        description: 'Pessoa excluída com sucesso.',
      });
      
      fetchPeople();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setEditingPerson(null);
    setFormData({
      nome: '',
      email: '',
      cargo: '',
      local: '',
      subTime: '',
      papel: Papel.COLABORADOR,
      gestorId: '',
      ativo: true
    });
  };

  const getPapelColor = (papel: string) => {
    switch (papel) {
      case 'ADMIN': return 'bg-red-100 text-red-800';
      case 'DIRETOR': return 'bg-purple-100 text-purple-800';
      case 'GESTOR': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (person?.papel !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Administração</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  {editingPerson ? 'Editar Pessoa' : 'Adicionar Pessoa'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome *</Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="cargo">Cargo</Label>
                    <Input
                      id="cargo"
                      value={formData.cargo}
                      onChange={(e) => setFormData(prev => ({ ...prev, cargo: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="local">Local</Label>
                    <Input
                      id="local"
                      value={formData.local}
                      onChange={(e) => setFormData(prev => ({ ...prev, local: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="subTime">Sub Time</Label>
                    <Input
                      id="subTime"
                      value={formData.subTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, subTime: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="papel">Papel</Label>
                    <Select 
                      value={formData.papel} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, papel: value as Papel }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={Papel.COLABORADOR}>Colaborador</SelectItem>
                        <SelectItem value={Papel.GESTOR}>Gestor</SelectItem>
                        <SelectItem value={Papel.DIRETOR}>Diretor</SelectItem>
                        <SelectItem value={Papel.ADMIN}>Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="gestor">Gestor Direto</Label>
                    <Select 
                      value={formData.gestorId} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, gestorId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um gestor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {people
                          .filter(p => p.papel === 'GESTOR' || p.papel === 'DIRETOR')
                          .map(person => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.nome}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ativo">Status</Label>
                    <Select 
                      value={formData.ativo ? 'true' : 'false'} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, ativo: value === 'true' }))}
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
                  
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">
                      {editingPerson ? 'Atualizar' : 'Criar'}
                    </Button>
                    {editingPerson && (
                      <Button type="button" variant="outline" onClick={resetForm}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* People List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Pessoas ({people.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {loading ? (
                    <p>Carregando...</p>
                  ) : people.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Nenhuma pessoa cadastrada.
                    </p>
                  ) : (
                    people.map((person) => (
                      <div key={person.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{person.nome}</h3>
                              <Badge className={getPapelColor(person.papel)}>
                                {person.papel}
                              </Badge>
                              {!person.ativo && (
                                <Badge variant="outline" className="text-red-600">
                                  Inativo
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">
                              {person.email}
                            </p>
                            {person.cargo && (
                              <p className="text-sm text-muted-foreground">
                                {person.cargo} {person.local && `• ${person.local}`}
                              </p>
                            )}
                            {person.subTime && (
                              <p className="text-sm text-muted-foreground">
                                Sub Time: {person.subTime}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(person)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(person.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}