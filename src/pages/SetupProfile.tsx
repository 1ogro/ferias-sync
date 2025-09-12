import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PersonOption {
  id: string;
  nome: string;
  email: string;
}

export default function SetupProfile() {
  const { user, person, loading: authLoading, profileChecked, createProfile } = useAuth();
  const navigate = useNavigate();
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [fetchingPeople, setFetchingPeople] = useState(true);

  useEffect(() => {
    // Only fetch people after profile check is complete
    if (profileChecked && !authLoading && user && !person) {
      fetchPeople();
    }
  }, [profileChecked, authLoading, user, person]);

  useEffect(() => {
    // Redirect if user already has a profile
    if (!authLoading && profileChecked && user && person) {
      console.log('User already has profile, redirecting to dashboard');
      navigate('/');
    }
  }, [user, person, authLoading, profileChecked, navigate]);

  const fetchPeople = async () => {
    console.log('Fetching people for signup...');
    setFetchingPeople(true);
    try {
      const { data, error } = await supabase
        .rpc('get_active_people_for_signup');

      console.log('RPC result:', { data, error });

      if (error) {
        console.error('RPC error:', error);
        throw error;
      }

      const peopleData = data || [];
      console.log('People data loaded:', peopleData.length, 'people');
      setPeople(peopleData);

      if (peopleData.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhuma pessoa encontrada',
          description: 'Não há pessoas ativas disponíveis para vinculação.',
        });
      }
    } catch (error) {
      console.error('Error fetching people:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar pessoas',
        description: `Não foi possível carregar a lista de pessoas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      });
    } finally {
      setFetchingPeople(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedPersonId) {
      toast({
        variant: 'destructive',
        title: 'Pessoa não selecionada',
        description: 'Por favor, selecione uma pessoa para continuar.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await createProfile(selectedPersonId);
      
      if (error) {
        throw error;
      }

      toast({
        title: 'Perfil criado com sucesso!',
        description: 'Redirecionando para o dashboard...',
      });
      
      navigate('/');
    } catch (error) {
      console.error('Error creating profile:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao criar perfil',
        description: 'Não foi possível criar o perfil. Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    navigate('/auth');
    return null;
  }

  // Show loading while checking profile
  if (authLoading || !profileChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-sm text-muted-foreground">Verificando perfil...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Calendar className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">Férias UXTD</h1>
          </div>
          <CardTitle>Configurar Perfil</CardTitle>
          <CardDescription>
            Para continuar, selecione sua identidade na organização
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Selecione seu nome da lista abaixo para vincular sua conta ao perfil organizacional correto.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">Selecionar Pessoa</label>
            <Select 
              value={selectedPersonId} 
              onValueChange={setSelectedPersonId}
              disabled={fetchingPeople}
            >
              <SelectTrigger>
                <SelectValue placeholder={fetchingPeople ? "Carregando..." : "Selecione uma pessoa"} />
              </SelectTrigger>
              <SelectContent>
                {people.length === 0 && !fetchingPeople ? (
                  <SelectItem value="no-people" disabled>
                    Nenhuma pessoa ativa encontrada
                  </SelectItem>
                ) : (
                  people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.nome} ({person.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full" 
            disabled={submitting || !selectedPersonId || fetchingPeople}
          >
            {submitting ? 'Criando perfil...' : 'Confirmar e Continuar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}