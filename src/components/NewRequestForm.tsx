import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TipoAusencia, ModeloContrato, Status, MaternityLeaveValidation } from "@/lib/types";
import { parseDateSafely } from "@/lib/dateUtils";
import { Calendar, AlertTriangle, CheckCircle, DollarSign, Baby } from "lucide-react";
import { validateMaternityLeave, calculateMaternityEndDate } from "@/lib/maternityLeaveUtils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { validateVacationRequest, VacationConflict } from "@/lib/vacationUtils";

interface FormData {
  tipo: TipoAusencia | "";
  inicio: string;
  fim: string;
  justificativa: string;
  dias_abono: number;
  data_prevista_parto?: string;
  is_contract_exception?: boolean;
  contract_exception_justification?: string;
}

export const NewRequestForm = () => {
  const { toast } = useToast();
  const { person } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    tipo: "",
    inicio: "",
    fim: "", 
    justificativa: "",
    dias_abono: 0,
    data_prevista_parto: "",
    is_contract_exception: false,
    contract_exception_justification: ""
  });
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
  const [maternityValidation, setMaternityValidation] = useState<MaternityLeaveValidation | null>(null);

  // Helper function to check if user can use abonos
  const canUseAbonos = () => {
    if (!person?.modelo_contrato) return false;
    return person.modelo_contrato === ModeloContrato.CLT || 
           person.modelo_contrato === ModeloContrato.CLT_ABONO_LIVRE ||
           person.modelo_contrato === ModeloContrato.CLT_ABONO_FIXO;
  };

  // Helper function to get abono constraints
  const getAbonoConstraints = () => {
    if (!person?.modelo_contrato) return { min: 0, max: 0, fixedOptions: [] };
    
    switch (person.modelo_contrato) {
      case ModeloContrato.CLT_ABONO_LIVRE:
        return { min: 0, max: 10, fixedOptions: [] };
      case ModeloContrato.CLT_ABONO_FIXO:
        return { min: 0, max: 10, fixedOptions: [0, 10] };
      case ModeloContrato.CLT:
        return { min: 0, max: 10, fixedOptions: [] }; // Default behavior
      default:
        return { min: 0, max: 0, fixedOptions: [] };
    }
  };

  // Check for conflicts and day-off validations
  const checkConflicts = async () => {
    if (!formData.inicio || !formData.fim || !person) return;

    try {
      // For vacation requests, use the new validation system
      if (formData.tipo === TipoAusencia.FERIAS) {
        const startDate = new Date(formData.inicio);
        const endDate = new Date(formData.fim);
        const requestedDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        // Validate abono limits
        if (formData.dias_abono > 0) {
          const abonoConstraints = getAbonoConstraints();
          
          if (formData.dias_abono > abonoConstraints.max) {
            setVacationValidation({
              valid: false,
              message: `O abono não pode exceder ${abonoConstraints.max} dias.`
            });
            setVacationConflicts([]);
            return;
          }
          
          if (formData.dias_abono > requestedDays) {
            setVacationValidation({
              valid: false,
              message: `O abono não pode ser maior que o período total de férias solicitado.`
            });
            setVacationConflicts([]);
            return;
          }
          
          // For fixed abono contracts, validate specific options
          if (abonoConstraints.fixedOptions.length > 0 && !abonoConstraints.fixedOptions.includes(formData.dias_abono)) {
            setVacationValidation({
              valid: false,
              message: `Para seu tipo de contrato, o abono deve ser ${abonoConstraints.fixedOptions.join(' ou ')} dias.`
            });
            setVacationConflicts([]);
            return;
          }
        }
        
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
        
        // Clear old conflicts for vacation requests
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
        .or(`and(inicio.lte.${formData.fim},fim.gte.${formData.inicio})`);

      if (data && data.length > 0) {
        const conflictNames = data.map(req => `${req.people.nome} (${parseDateSafely(req.inicio).toLocaleDateString('pt-BR')} - ${parseDateSafely(req.fim).toLocaleDateString('pt-BR')})`);
        setConflicts(conflictNames);
      } else {
        setConflicts([]);
      }
      
      // Clear vacation-specific validation for day-off
      setVacationConflicts([]);
      setVacationValidation({ valid: true, message: "" });
    } catch (error) {
      console.error('Error checking conflicts:', error);
    }
  };

  // Check if day-off was already used this year
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
        .lte('inicio', `${currentYear}-12-31`);

      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking day-off usage:', error);
      return false;
    }
  };

  // Validate Day Off eligibility period
  const validateDayOff = () => {
    if (formData.tipo !== TipoAusencia.DAYOFF || !person?.data_nascimento || !formData.inicio) {
      return { isValid: true, message: "" };
    }

    const birth = new Date(person.data_nascimento);
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Birthday this year
    const birthdayThisYear = new Date(currentYear, birth.getMonth(), birth.getDate());
    
    // Check if we're before the birthday this year
    if (today < birthdayThisYear) {
      const birthdayStr = birthdayThisYear.toLocaleDateString('pt-BR');
      return {
        isValid: false,
        message: `Day-off só pode ser solicitado a partir do seu aniversário (${birthdayStr})`
      };
    }

    // We're in the eligibility period - day-off can be requested for any date
    return { isValid: true, message: "" };
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto-set fim date for day-off to be the same as inicio
      if (field === "inicio" && prev.tipo === TipoAusencia.DAYOFF) {
        newData.fim = value as string;
      }
      
      // Reset fim when tipo changes to day-off
      if (field === "tipo" && value === TipoAusencia.DAYOFF) {
        newData.fim = newData.inicio;
        newData.dias_abono = 0; // Reset abono for day-off
      }
      
      // Reset abono when changing from vacation to other types
      if (field === "tipo" && value !== TipoAusencia.FERIAS) {
        newData.dias_abono = 0;
      }
      
      // Reset maternity fields when changing from maternity leave
      if (field === "tipo" && value !== TipoAusencia.LICENCA_MATERNIDADE) {
        newData.data_prevista_parto = "";
        newData.is_contract_exception = false;
        newData.contract_exception_justification = "";
      }
      
      return newData;
    });
    
    if (field === "inicio" || field === "fim") {
      setTimeout(checkConflicts, 500); // Debounced conflict check
    }
    
    if (field === "tipo" && value === TipoAusencia.DAYOFF) {
      checkDayOffUsage().then(setDayOffAlreadyUsed);
    }
  };
  
  // Validate maternity leave when dates change
  useEffect(() => {
    if (formData.tipo === TipoAusencia.LICENCA_MATERNIDADE && formData.inicio && person) {
      validateMaternityLeave(person.id, new Date(formData.inicio))
        .then(validation => {
          setMaternityValidation(validation);
          if (validation.valid && validation.total_days) {
            // Auto-calculate end date
            const endDate = calculateMaternityEndDate(
              new Date(formData.inicio),
              validation.total_days
            );
            setFormData(prev => ({
              ...prev,
              fim: endDate.toISOString().split('T')[0],
              is_contract_exception: (validation.extension_days || 0) > 0
            }));
          }
        });
    }
  }, [formData.tipo, formData.inicio, person]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;
    
    setIsSubmitting(true);

    try {
      // Insert the new request with proper status transition
      let initialStatus = Status.PENDENTE;
      
      // Auto-approve for directors
      if (person.papel === 'DIRETOR' || person.is_admin) {
        initialStatus = Status.APROVADO_FINAL;
      } else {
        // Find the user's manager to determine next status
        const { data: managerData } = await supabase
          .from('people')
          .select('papel')
          .eq('id', person.gestorId || '')
          .maybeSingle();
        
        // If manager is a director, go straight to director analysis
        if (managerData?.papel === 'DIRETOR') {
          initialStatus = Status.EM_ANALISE_DIRETOR;
        } else {
          // Otherwise, go to manager analysis first
          initialStatus = Status.EM_ANALISE_GESTOR;
        }
      }

      const { data: newRequest, error } = await supabase
        .from('requests')
        .insert({
          requester_id: person.id,
          tipo: formData.tipo,
          inicio: formData.inicio,
          fim: formData.fim,
          justificativa: formData.justificativa,
          conflito_flag: conflicts.length > 0,
          conflito_refs: conflicts.length > 0 ? conflicts.join(',') : null,
          dias_abono: formData.dias_abono,
          data_prevista_parto: formData.data_prevista_parto || null,
          is_contract_exception: formData.is_contract_exception || false,
          contract_exception_justification: formData.contract_exception_justification || null,
          status: initialStatus,
        })
        .select()
        .single();

      if (error) throw error;

      // Create auto-approval record for directors
      const isDirector = person.papel === 'DIRETOR' || person.is_admin;
      if (isDirector && newRequest) {
        await supabase
          .from('approvals')
          .insert({
            request_id: newRequest.id,
            approver_id: person.id,
            acao: 'APROVADO',
            level: 'AUTO_APROVACAO',
            comentario: 'Auto-aprovação para cargo de Diretor'
          });
      }

      if (error) throw error;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: newRequest?.id || 'new_request',
          acao: 'CREATE',
          payload: { tipo: formData.tipo, inicio: formData.inicio, fim: formData.fim, auto_approved: isDirector },
          actor_id: person.id
        });

      // Send email notification to manager (if not auto-approved)
      if (!isDirector && person.gestorId) {
        try {
          const { data: managerData } = await supabase
            .from('people')
            .select('email')
            .eq('id', person.gestorId)
            .single();

          if (managerData?.email) {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                type: 'NEW_REQUEST',
                to: managerData.email,
                requesterName: person.nome,
                requestType: formData.tipo,
                startDate: new Date(formData.inicio).toLocaleDateString('pt-BR'),
                endDate: new Date(formData.fim).toLocaleDateString('pt-BR'),
              }
            });
          }
        } catch (emailError) {
          console.error('Error sending email notification:', emailError);
          // Don't block the flow if email fails
        }
      }

      toast({
        title: isDirector ? "Solicitação aprovada automaticamente!" : "Solicitação enviada!",
        description: isDirector ? "Sua solicitação foi aprovada automaticamente devido ao seu cargo." : "Seu gestor receberá uma notificação para aprovação.",
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
      const { data: newDraft, error } = await supabase
        .from('requests')
        .insert({
          requester_id: person.id,
          tipo: formData.tipo,
          inicio: formData.inicio || null,
          fim: formData.fim || null,
          justificativa: formData.justificativa || '',
          conflito_flag: false,
          conflito_refs: null,
          status: 'RASCUNHO',
          dias_abono: formData.dias_abono
        })
        .select()
        .single();

      if (error) throw error;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: newDraft?.id || 'draft',
          acao: 'SAVE_DRAFT',
          payload: { tipo: formData.tipo, is_draft: true },
          actor_id: person.id
        });

      toast({
        title: "Rascunho salvo!",
        description: "Sua solicitação foi salva como rascunho.",
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

  const dayOffValidation = validateDayOff();
  const isFormValid = formData.tipo && formData.inicio && formData.fim && formData.justificativa &&
    dayOffValidation.isValid && !dayOffAlreadyUsed &&
    (formData.tipo === TipoAusencia.DAYOFF || vacationValidation.valid) &&
    (formData.tipo !== TipoAusencia.LICENCA_MATERNIDADE || (maternityValidation?.valid && formData.data_prevista_parto));

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Nova Solicitação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  <SelectItem value={TipoAusencia.LICENCA_MATERNIDADE}>Licença Maternidade</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Maternity Leave Expected Delivery Date */}
            {formData.tipo === TipoAusencia.LICENCA_MATERNIDADE && (
              <div className="space-y-4 p-4 bg-pink-50 dark:bg-pink-950/20 rounded-lg border border-pink-200 dark:border-pink-900">
                <div className="flex items-center gap-2 mb-2">
                  <Baby className="w-5 h-5 text-pink-600" />
                  <Label className="text-base font-medium">Informações da Licença Maternidade</Label>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="data_prevista_parto">Data Prevista do Parto *</Label>
                  <Input
                    id="data_prevista_parto"
                    type="date"
                    value={formData.data_prevista_parto}
                    onChange={(e) => handleInputChange("data_prevista_parto", e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-sm text-muted-foreground">
                    A licença pode iniciar até 28 dias antes do parto previsto
                  </p>
                </div>
                
                {maternityValidation && maternityValidation.valid && (
                  <Alert className="bg-white dark:bg-background">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p><strong>Duração da Licença:</strong> {maternityValidation.total_days} dias</p>
                        <p className="text-sm text-muted-foreground">
                          • {maternityValidation.clt_days} dias (CLT)
                          {(maternityValidation.extension_days || 0) > 0 && (
                            <span> + {maternityValidation.extension_days} dias (extensão contratual)</span>
                          )}
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                
                {maternityValidation?.valid === false && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      {maternityValidation.message}
                    </AlertDescription>
                  </Alert>
                )}
                
                {maternityValidation && (maternityValidation.extension_days || 0) > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="contract_exception_justification">
                      Justificativa para Extensão Contratual *
                    </Label>
                    <Textarea
                      id="contract_exception_justification"
                      value={formData.contract_exception_justification}
                      onChange={(e) => handleInputChange("contract_exception_justification", e.target.value)}
                      placeholder="Descreva o motivo da extensão além dos 120 dias da CLT..."
                      rows={2}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inicio">
                  Data de Início *
                  {formData.tipo === TipoAusencia.DAYOFF && person?.data_nascimento && (
                    <span className="text-sm text-muted-foreground ml-2">
                      (Day Off disponível a partir de {new Date(new Date().getFullYear(), new Date(person.data_nascimento).getMonth(), new Date(person.data_nascimento).getDate()).toLocaleDateString('pt-BR')})
                    </span>
                  )}
                  {formData.tipo === TipoAusencia.LICENCA_MATERNIDADE && (
                    <span className="text-sm text-muted-foreground ml-2">
                      (Até 28 dias antes do parto)
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
                <Label htmlFor="fim">
                  Data de Fim * 
                  {formData.tipo === TipoAusencia.LICENCA_MATERNIDADE && (
                    <span className="text-sm text-muted-foreground ml-2">(Calculado automaticamente)</span>
                  )}
                </Label>
                <Input
                  id="fim"
                  type="date"
                  value={formData.fim}
                  onChange={(e) => handleInputChange("fim", e.target.value)}
                  min={formData.inicio || new Date().toISOString().split('T')[0]}
                  disabled={formData.tipo === TipoAusencia.DAYOFF || formData.tipo === TipoAusencia.LICENCA_MATERNIDADE}
                />
              </div>
            </div>

            {/* Abono Section - Only for vacation requests with CLT contracts */}
            {formData.tipo === TipoAusencia.FERIAS && canUseAbonos() && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <Label className="text-base font-medium">Abono de Férias (Venda de Dias)</Label>
                  <Badge variant="outline" className="text-xs">
                    {person?.modelo_contrato === ModeloContrato.CLT_ABONO_FIXO ? "0 ou 10 dias" : "0-10 dias"}
                  </Badge>
                </div>
                
                {(() => {
                  const constraints = getAbonoConstraints();
                  if (constraints.fixedOptions.length > 0) {
                    // Fixed options (CLT_ABONO_FIXO)
                    return (
                      <Select 
                        value={formData.dias_abono.toString()} 
                        onValueChange={(value) => handleInputChange("dias_abono", parseInt(value))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione os dias de abono" />
                        </SelectTrigger>
                        <SelectContent>
                          {constraints.fixedOptions.map(option => (
                            <SelectItem key={option} value={option.toString()}>
                              {option === 0 ? "Não vender dias" : `Vender ${option} dias`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  } else {
                    // Free range (CLT_ABONO_LIVRE or CLT)
                    return (
                      <div className="space-y-2">
                        <Label htmlFor="dias_abono">
                          Dias a vender (0-{constraints.max})
                        </Label>
                        <Input
                          id="dias_abono"
                          type="number"
                          min={constraints.min}
                          max={constraints.max}
                          value={formData.dias_abono}
                          onChange={(e) => handleInputChange("dias_abono", parseInt(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </div>
                    );
                  }
                })()}
                
                {formData.dias_abono > 0 && (
                  <Alert>
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Abono:</strong> {formData.dias_abono} dia{formData.dias_abono > 1 ? 's' : ''} será{formData.dias_abono > 1 ? 'ão' : ''} vendido{formData.dias_abono > 1 ? 's' : ''}
                      {calculateDays() > 0 && (
                        <span className="ml-2">
                          | <strong>Férias:</strong> {calculateDays() - formData.dias_abono} dia{(calculateDays() - formData.dias_abono) > 1 ? 's' : ''}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                
                <p className="text-xs text-muted-foreground">
                  O abono permite "vender" dias de férias de volta para a empresa. 
                  Férias mínimas exigidas por lei: 10 dias corridos.
                </p>
              </div>
            )}

            {/* Day Off Validation Messages */}
            {formData.tipo === TipoAusencia.DAYOFF && !person?.data_nascimento && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  <strong>Atenção:</strong> Você precisa cadastrar sua data de nascimento no perfil para solicitar Day Off.
                  <br />
                  <small>Day Off pode ser solicitado a qualquer momento após o seu aniversário (até a véspera do próximo aniversário).</small>
                </AlertDescription>
              </Alert>
            )}

            {formData.tipo === TipoAusencia.DAYOFF && dayOffAlreadyUsed && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  <strong>Day-off já utilizado este ano!</strong> Você já usou seu day-off de {new Date().getFullYear()}.
                  <br />
                  <small>O day-off será resetado em 01/01/{new Date().getFullYear() + 1}.</small>
                </AlertDescription>
              </Alert>
            )}

            {formData.tipo === TipoAusencia.DAYOFF && formData.inicio && (() => {
              const validation = validateDayOff();
              return !validation.isValid ? (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>{validation.message}</AlertDescription>
                </Alert>
              ) : null;
            })()}

            {/* Vacation Balance Display */}
            {formData.tipo === TipoAusencia.FERIAS && vacationValidation.availableBalance !== undefined && (
              <Alert className={vacationValidation.valid ? "" : "border-destructive"}>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription>
                  <strong>Saldo disponível:</strong> {vacationValidation.availableBalance} dias
                  {calculateDays() > 0 && (
                    <span className="ml-2">
                      | <strong>Total solicitado:</strong> {calculateDays()} dia{calculateDays() > 1 ? 's' : ''}
                      {formData.dias_abono > 0 && (
                        <span> (Férias: {calculateDays() - formData.dias_abono} + Abono: {formData.dias_abono})</span>
                      )}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Duration Display */}
            {calculateDays() > 0 && formData.tipo === TipoAusencia.DAYOFF && (
              <Alert>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription>
                  <strong>Duração:</strong> {calculateDays()} dia{calculateDays() > 1 ? 's' : ''}
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

            {/* Vacation Conflicts */}
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

            {/* Conflict Alert */}
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
                  <p className="text-sm mt-2">
                    Você pode prosseguir, mas será necessária justificativa adicional.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Justification */}
            <div className="space-y-2">
              <Label htmlFor="justificativa">
                Justificativa * {conflicts.length > 0 && "(Obrigatória devido ao conflito)"}
              </Label>
              <Textarea
                id="justificativa"
                placeholder="Descreva o motivo da sua solicitação..."
                value={formData.justificativa}
                onChange={(e) => handleInputChange("justificativa", e.target.value)}
                rows={3}
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-3 pt-4">
              <Button 
                type="submit" 
                disabled={!isFormValid || isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? "Enviando..." : "Enviar Solicitação"}
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
  );
};