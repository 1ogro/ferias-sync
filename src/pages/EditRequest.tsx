import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { parseDateSafely } from "@/lib/dateUtils";
import { TipoAusencia, Status } from "@/lib/types";
import { Calendar, AlertTriangle, CheckCircle, ArrowLeft, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { validateVacationRequest, VacationConflict } from "@/lib/vacationUtils";

interface FormData {
  tipo: TipoAusencia | "";
  inicio: string;
  fim: string;
  justificativa: string;
}

const EditRequest = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { person } = useAuth();
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    tipo: "",
    inicio: "",
    fim: "",
    justificativa: ""
  });
  const [originalStatus, setOriginalStatus] = useState<Status | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [dayOffAlreadyUsed, setDayOffAlreadyUsed] = useState(false);
  const [vacationConflicts, setVacationConflicts] = useState<VacationConflict[]>([]);
  const [vacationValidation, setVacationValidation] = useState<{
    valid: boolean;
    message: string;
    availableBalance?: number;
  }>({ valid: true, message: "" });

  // Fetch request data
  useEffect(() => {
    const fetchRequest = async () => {
      if (!id || !person) return;
      
      try {
        const { data: requestData, error } = await supabase
          .from('requests')
          .select('*')
          .eq('id', id)
          .eq('requester_id', person.id) // Only allow editing own requests
          .single();
        
        if (error) {
          console.error('Error fetching request:', error);
          toast({
            title: "Erro",
            description: "Solicitação não encontrada ou você não tem permissão para editá-la.",
            variant: "destructive",
          });
          navigate('/');
          return;
        }
        
        if (requestData) {
          setFormData({
            tipo: requestData.tipo as TipoAusencia,
            inicio: requestData.inicio || "",
            fim: requestData.fim || "",
            justificativa: requestData.justificativa || ""
          });
          setOriginalStatus(requestData.status as Status);
        }
      } catch (error) {
        console.error('Error fetching request:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar solicitação.",
          variant: "destructive",
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    
    fetchRequest();
  }, [id, person, navigate, toast]);

  // Check for conflicts and validations
  const checkConflicts = async () => {
    if (!formData.inicio || !formData.fim || !person) return;

    try {
      // For vacation requests, use the new validation system
      if (formData.tipo === TipoAusencia.FERIAS) {
        const startDate = new Date(formData.inicio);
        const endDate = new Date(formData.fim);
        const requestedDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        const validation = await validateVacationRequest(
          person.id,
          startDate,
          endDate,
          requestedDays
        );
        
        setVacationValidation({
          valid: validation.valid,
          message: validation.message,
          availableBalance: validation.balance?.balance_days
        });
        
        if (validation.conflicts) {
          setVacationConflicts(validation.conflicts);
        } else {
          setVacationConflicts([]);
        }
        
        setConflicts([]);
        return;
      }

      // Legacy conflict checking for day-off requests
      const { data } = await supabase
        .from('requests')
        .select(`
          id,
          requester_id,
          inicio,
          fim,
          people!inner(nome, sub_time)
        `)
        .eq('people.sub_time', person.subTime)
        .in('status', ['PENDENTE', 'EM_ANALISE_GESTOR', 'APROVADO_1NIVEL', 'EM_ANALISE_DIRETOR', 'APROVADO_FINAL'])
        .or(`and(inicio.lte.${formData.fim},fim.gte.${formData.inicio})`)
        .neq('id', id); // Exclude current request

      if (data && data.length > 0) {
        const conflictNames = data.map(req => `${req.people.nome} (${parseDateSafely(req.inicio).toLocaleDateString('pt-BR')} - ${parseDateSafely(req.fim).toLocaleDateString('pt-BR')})`);
        setConflicts(conflictNames);
      } else {
        setConflicts([]);
      }
      
      setVacationConflicts([]);
      setVacationValidation({ valid: true, message: "" });
    } catch (error) {
      console.error('Error checking conflicts:', error);
    }
  };

  // Check if day-off was already used this year (excluding current request)
  const checkDayOffUsage = async () => {
    if (formData.tipo !== TipoAusencia.DAYOFF || !person) return;

    try {
      const currentYear = new Date().getFullYear();
      const { data } = await supabase
        .from('requests')
        .select('id, inicio, status')
        .eq('requester_id', person.id)
        .eq('tipo', TipoAusencia.DAYOFF)
        .in('status', ['APROVADO_FINAL', 'REALIZADO'])
        .gte('inicio', `${currentYear}-01-01`)
        .lte('inicio', `${currentYear}-12-31`)
        .neq('id', id); // Exclude current request

      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking day-off usage:', error);
      return false;
    }
  };

  // Validate day-off date
  const validateDayOff = () => {
    if (formData.tipo !== TipoAusencia.DAYOFF || !person?.data_nascimento || !formData.inicio) {
      return { isValid: true, message: "" };
    }

    const selectedDate = new Date(formData.inicio);
    const birthDate = new Date(person.data_nascimento);
    const currentYear = selectedDate.getFullYear();
    const birthdayThisYear = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());

    if (selectedDate.getTime() !== birthdayThisYear.getTime()) {
      return {
        isValid: false,
        message: `Day Off só pode ser solicitado no dia do seu aniversário (${birthdayThisYear.toLocaleDateString('pt-BR')})`
      };
    }

    return { isValid: true, message: "" };
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto-set fim date for day-off to be the same as inicio
      if (field === "inicio" && prev.tipo === TipoAusencia.DAYOFF) {
        newData.fim = value;
      }
      
      // Reset fim when tipo changes to day-off
      if (field === "tipo" && value === TipoAusencia.DAYOFF) {
        newData.fim = newData.inicio;
      }
      
      return newData;
    });
    
    if (field === "inicio" || field === "fim") {
      setTimeout(checkConflicts, 500);
    }
    
    if (field === "tipo" && value === TipoAusencia.DAYOFF) {
      checkDayOffUsage().then(setDayOffAlreadyUsed);
    }
  };

  const calculateDays = () => {
    if (formData.inicio && formData.fim) {
      const start = new Date(formData.inicio);
      const end = new Date(formData.fim);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays;
    }
    return 0;
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;
    
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('requests')
        .update({
          tipo: formData.tipo,
          inicio: formData.inicio,
          fim: formData.fim,
          justificativa: formData.justificativa,
          conflito_flag: conflicts.length > 0 || vacationConflicts.length > 0,
          conflito_refs: [...conflicts, ...vacationConflicts.map(c => c.message)].join('; '),
          status: originalStatus === Status.RASCUNHO ? 'PENDENTE' : originalStatus // Submit draft as PENDENTE
        })
        .eq('id', id);

      if (error) throw error;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: id!,
          acao: 'UPDATE',
          payload: { tipo: formData.tipo, inicio: formData.inicio, fim: formData.fim },
          actor_id: person.id
        });

      toast({
        title: originalStatus === Status.RASCUNHO ? "Solicitação enviada!" : "Solicitação atualizada!",
        description: originalStatus === Status.RASCUNHO ? "Sua solicitação foi enviada para aprovação." : "As alterações foram salvas.",
      });
      
      navigate('/');
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!person || !formData.tipo) {
      toast({
        title: "Erro",
        description: "Tipo de ausência é obrigatório para salvar rascunho.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSavingDraft(true);

    try {
      const { error } = await supabase
        .from('requests')
        .update({
          tipo: formData.tipo,
          inicio: formData.inicio || null,
          fim: formData.fim || null,
          justificativa: formData.justificativa || '',
          conflito_flag: false,
          conflito_refs: null,
          status: 'RASCUNHO'
        })
        .eq('id', id);

      if (error) throw error;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: id!,
          acao: 'UPDATE_DRAFT',
          payload: { tipo: formData.tipo, is_draft: true },
          actor_id: person.id
        });

      toast({
        title: "Rascunho atualizado!",
        description: "Suas alterações foram salvas como rascunho.",
      });
      
      navigate('/');
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Carregando...</h2>
          </div>
        </main>
      </div>
    );
  }

  const dayOffValidation = validateDayOff();
  const isFormValid = formData.tipo && formData.inicio && formData.fim && formData.justificativa &&
    dayOffValidation.isValid && !dayOffAlreadyUsed &&
    (formData.tipo === TipoAusencia.DAYOFF || vacationValidation.valid);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-primary" />
                Editar Solicitação
                {originalStatus === Status.RASCUNHO && (
                  <Badge variant="outline" className="ml-2">Rascunho</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdate} className="space-y-6">
                {/* Type Selection */}
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo de Ausência *</Label>
                  <Select 
                    value={formData.tipo} 
                    onValueChange={(value) => handleInputChange("tipo", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TipoAusencia.FERIAS}>Férias</SelectItem>
                      <SelectItem value={TipoAusencia.DAYOFF}>Day Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inicio">
                      Data de Início *
                      {formData.tipo === TipoAusencia.DAYOFF && person?.data_nascimento && (
                        <span className="text-sm text-muted-foreground ml-2">
                          (Day Off: {new Date(new Date().getFullYear(), new Date(person.data_nascimento).getMonth(), new Date(person.data_nascimento).getDate()).toLocaleDateString('pt-BR')})
                        </span>
                      )}
                    </Label>
                    <Input
                      id="inicio"
                      type="date"
                      value={formData.inicio}
                      onChange={(e) => handleInputChange("inicio", e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fim">Data de Fim *</Label>
                    <Input
                      id="fim"
                      type="date"
                      value={formData.fim}
                      onChange={(e) => handleInputChange("fim", e.target.value)}
                      min={formData.inicio || new Date().toISOString().split('T')[0]}
                      disabled={formData.tipo === TipoAusencia.DAYOFF}
                    />
                  </div>
                </div>

                {/* Validation Messages */}
                {formData.tipo === TipoAusencia.DAYOFF && !person?.data_nascimento && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Atenção:</strong> Você precisa cadastrar sua data de nascimento no perfil para solicitar Day Off.
                    </AlertDescription>
                  </Alert>
                )}

                {formData.tipo === TipoAusencia.DAYOFF && dayOffAlreadyUsed && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Day-off já utilizado este ano!</strong> Você já usou seu day-off de {new Date().getFullYear()}.
                    </AlertDescription>
                  </Alert>
                )}

                {formData.tipo === TipoAusencia.DAYOFF && formData.inicio && !dayOffValidation.isValid && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{dayOffValidation.message}</AlertDescription>
                  </Alert>
                )}

                {/* Vacation Balance Display */}
                {formData.tipo === TipoAusencia.FERIAS && vacationValidation.availableBalance !== undefined && (
                  <Alert className={vacationValidation.valid ? "" : "border-destructive"}>
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Saldo disponível:</strong> {vacationValidation.availableBalance} dias
                      {calculateDays() > 0 && (
                        <span className="ml-2">
                          | <strong>Solicitando:</strong> {calculateDays()} dia{calculateDays() > 1 ? 's' : ''}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Vacation Validation Messages */}
                {formData.tipo === TipoAusencia.FERIAS && !vacationValidation.valid && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Erro na solicitação de férias:</strong> {vacationValidation.message}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Conflict Alerts */}
                {vacationConflicts.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Conflitos detectados:</strong>
                      {vacationConflicts.map((conflict, index) => (
                        <div key={index} className="mt-2">
                          <p className="font-medium">{conflict.message}</p>
                          <ul className="mt-1 text-sm">
                            {conflict.conflicted_requests.map((req, reqIndex) => (
                              <li key={reqIndex}>
                                • {req.requester.nome} ({req.inicio.toLocaleDateString('pt-BR')} - {req.fim.toLocaleDateString('pt-BR')})
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}

                {conflicts.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Conflito detectado:</strong>
                      <ul className="mt-1">
                        {conflicts.map((conflict, index) => (
                          <li key={index} className="text-sm">• {conflict}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Duration Display */}
                {calculateDays() > 0 && (
                  <Alert>
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Duração:</strong> {calculateDays()} dia{calculateDays() > 1 ? 's' : ''}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Justification */}
                <div className="space-y-2">
                  <Label htmlFor="justificativa">Justificativa *</Label>
                  <Textarea
                    id="justificativa"
                    placeholder="Descreva o motivo da sua solicitação..."
                    value={formData.justificativa}
                    onChange={(e) => handleInputChange("justificativa", e.target.value)}
                    rows={4}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button 
                    type="submit" 
                    disabled={!isFormValid || isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? "Atualizando..." : originalStatus === Status.RASCUNHO ? "Enviar Solicitação" : "Atualizar Solicitação"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={!formData.tipo || isSavingDraft}
                  >
                    {isSavingDraft ? "Salvando..." : "Salvar Rascunho"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default EditRequest;