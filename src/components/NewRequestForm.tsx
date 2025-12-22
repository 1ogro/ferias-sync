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
import { parseDateSafely, validateDayOffEligibility, getDayOffEligibilityPeriod } from "@/lib/dateUtils";
import { Calendar, AlertTriangle, CheckCircle, DollarSign, Baby, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const navigate = useNavigate();
  const { person, hasRole } = useAuth();
  
  useEffect(() => {
    const checkDirector = async () => {
      const isDir = await hasRole('DIRETOR');
      setIsDirector(isDir);
    };
    checkDirector();
  }, [hasRole]);
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
  const [isDirector, setIsDirector] = useState(false);
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
          requestedDays,
          isDirector
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
    if (formData.tipo !== TipoAusencia.DAYOFF || !person) return false;

    console.log('[DayOff Debug] checkDayOffUsage called:', {
      requester_id: person.id,
      year: new Date().getFullYear(),
      tipo: formData.tipo
    });

    try {
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from('requests')
        .select('id, inicio, status')
        .eq('requester_id', person.id)
        .eq('tipo', TipoAusencia.DAYOFF)
        .in('status', ['APROVADO_FINAL', 'REALIZADO'])
        .gte('inicio', `${currentYear}-01-01`)
        .lte('inicio', `${currentYear}-12-31`);

      const alreadyUsed = data && data.length > 0;
      
      console.log('[DayOff Debug] checkDayOffUsage result:', {
        requester_id: person.id,
        year: currentYear,
        existingDayOffs: data,
        alreadyUsed,
        error: error?.message
      });

      return alreadyUsed;
    } catch (error) {
      console.error('[DayOff Debug] Error checking day-off usage:', error);
      return false;
    }
  };

  // Get day-off validation using centralized function
  const getDayOffValidation = () => {
    const validation = validateDayOffEligibility(
      person?.data_nascimento,
      dayOffAlreadyUsed,
      isDirector,
      true // Enable debug logging
    );
    
    console.log('[DayOff Debug] getDayOffValidation result:', {
      tipo: formData.tipo,
      isValid: validation.isValid,
      message: validation.message,
      period: validation.period,
      debug: validation.debug
    });
    
    return validation;
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
        let managerData: { email: string } | null = null;
        
        try {
          const { data } = await supabase
            .from('people')
            .select('email')
            .eq('id', person.gestorId)
            .single();
          
          managerData = data;

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

        // Send Slack notification to manager
        try {
          if (managerData?.email) {
            await supabase.functions.invoke('slack-notification', {
              body: {
                type: 'NEW_REQUEST',
                requestId: newRequest.id,
                requesterName: person.nome,
                requestType: formData.tipo,
                startDate: new Date(formData.inicio).toLocaleDateString('pt-BR'),
                endDate: new Date(formData.fim).toLocaleDateString('pt-BR'),
                approverEmail: managerData.email,
              }
            });
          }
        } catch (slackError) {
          console.error('Error sending Slack notification:', slackError);
          // Don't block the flow if Slack fails
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

  const dayOffValidation = getDayOffValidation();
  const hasAbono = formData.tipo === TipoAusencia.FERIAS && formData.dias_abono > 0;
  const isMaternityLeave = formData.tipo === TipoAusencia.LICENCA_MATERNIDADE;
  const isFormValid = formData.tipo && formData.inicio && formData.fim && formData.justificativa &&
    (isDirector || (
      (formData.tipo !== TipoAusencia.DAYOFF || dayOffValidation.isValid) && 
      (formData.tipo === TipoAusencia.DAYOFF || vacationValidation.valid)
    )) &&
    (!isMaternityLeave || maternityValidation?.valid) &&
    (!hasAbono || (formData.dias_abono && formData.dias_abono > 0));

  console.log('[DayOff Debug] Form validation state:', {
    tipo: formData.tipo,
    isDayOff: formData.tipo === TipoAusencia.DAYOFF,
    dayOffValidation: dayOffValidation.isValid,
    dayOffAlreadyUsed,
    isDirector,
    vacationValidation: vacationValidation.valid,
    isFormValid,
    hasRequiredFields: !!(formData.tipo && formData.inicio && formData.fim && formData.justificativa)
  });

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
                <Label htmlFor="inicio" className="flex items-center gap-1">
                  Data de Início *
                  {formData.tipo === TipoAusencia.DAYOFF && person?.data_nascimento && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground ml-1 cursor-help">
                            (a partir de {new Date(new Date().getFullYear(), new Date(person.data_nascimento).getMonth(), 1).toLocaleDateString('pt-BR')})
                            <HelpCircle className="w-3.5 h-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium mb-1">Período de elegibilidade do Day Off</p>
                          <p className="text-sm">O day-off pode ser solicitado a partir do <strong>primeiro dia do seu mês de aniversário</strong> até a véspera do próximo aniversário.</p>
                          <p className="text-sm mt-1 text-muted-foreground">Você tem direito a 1 day-off por ano.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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

            {/* Day Off Eligibility Period - Using centralized validation */}
            {formData.tipo === TipoAusencia.DAYOFF && dayOffValidation.isValid && dayOffValidation.period && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  <strong>Período de elegibilidade:</strong> {dayOffValidation.period.startFormatted} a {dayOffValidation.period.endFormatted}
                  <br />
                  <small className="text-green-700 dark:text-green-300">Você tem 1 day-off disponível para usar neste período.</small>
                </AlertDescription>
              </Alert>
            )}

            {/* Day Off Validation Error Messages - Using centralized validation */}
            {formData.tipo === TipoAusencia.DAYOFF && !dayOffValidation.isValid && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  {dayOffValidation.message}
                  {dayOffValidation.period && (
                    <>
                      <br />
                      <small>Período de elegibilidade: {dayOffValidation.period.startFormatted} a {dayOffValidation.period.endFormatted}</small>
                    </>
                  )}
                </AlertDescription>
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
            {isDirector && (vacationConflicts.length > 0 || conflicts.length > 0) && (
              <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>⚠️ Criação Privilegiada:</strong> Como diretor, você pode criar esta solicitação 
                  mesmo com conflitos detectados. Os conflitos serão registrados para referência futura.
                  {vacationConflicts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {vacationConflicts.map((conflict, index) => (
                        <div key={index}>
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
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {!isDirector && vacationConflicts.length > 0 && (
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
            {!isDirector && conflicts.length > 0 && (
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