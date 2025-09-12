import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface FormData {
  requesterId: string;
  tipo: string;
  inicio: string;
  fim: string;
  justificativa: string;
  originalDate: string;
  originalChannel: string;
  adminObservations: string;
  finalStatus: Status;
}

import { Status, TipoAusencia } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const VACATION_TYPES = [
  { value: "ferias-anuais", label: "Férias Anuais" },
  { value: "ferias-coletivas", label: "Férias Coletivas" },
  { value: "ferias-vendidas", label: "Férias Vendidas" },
  { value: "abono-ferias", label: "Abono de Férias" }
];

const ORIGINAL_CHANNELS = [
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "presencial", label: "Presencial" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "outro", label: "Outro" }
];

interface SimplePerson {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  sub_time: string | null;
}

interface HistoricalRequestFormProps {
  onSuccess?: () => void;
}

export const HistoricalRequestForm = ({ onSuccess }: HistoricalRequestFormProps) => {
  const { toast } = useToast();
  const { person } = useAuth();
  const [people, setPeople] = useState<SimplePerson[]>([]);
  const [formData, setFormData] = useState<FormData>({
    requesterId: "",
    tipo: "",
    inicio: "",
    fim: "",
    justificativa: "",
    originalDate: "",
    originalChannel: "",
    adminObservations: "",
    finalStatus: Status.APROVADO_FINAL
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [originalDate, setOriginalDate] = useState<Date>();

  useEffect(() => {
    fetchPeople();
  }, []);

  const fetchPeople = async () => {
    try {
      const { data, error } = await supabase
        .from('people')
        .select('id, nome, email, cargo, sub_time')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setPeople(data || []);
    } catch (error) {
      console.error('Error fetching people:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao buscar colaboradores."
      });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person || person.papel !== 'DIRETOR') {
      toast({
        variant: 'destructive',
        title: 'Erro de autorização',
        description: 'Apenas diretores podem cadastrar solicitações históricas.',
      });
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Create the historical request with new columns
      const { data: newRequest, error } = await supabase
        .from('requests')
        .insert({
          requester_id: formData.requesterId,
          tipo: formData.tipo,
          inicio: formData.inicio,
          fim: formData.fim,
          justificativa: formData.justificativa,
          conflito_flag: false,
          conflito_refs: null,
          status: formData.finalStatus,
          is_historical: true,
          original_created_at: formData.originalDate,
          original_channel: formData.originalChannel,
          admin_observations: formData.adminObservations
        })
        .select()
        .single();

      if (error) throw error;

      // Create approval record if the request was approved
      if (formData.finalStatus === Status.APROVADO_FINAL || formData.finalStatus === Status.REALIZADO) {
        try {
          await supabase
            .from('approvals')
            .insert({
              request_id: newRequest.id,
              approver_id: person.id,
              level: 'DIRETOR',
              acao: 'APROVAR',
              comentario: `Aprovação histórica - Canal: ${formData.originalChannel}. ${formData.adminObservations || ''}`
            });
        } catch (approvalError) {
          // Log approval error but don't fail the whole operation
          console.warn('Failed to create approval record:', approvalError);
        }
      }

      // Log the historical creation in audit logs
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: newRequest.id,
          acao: 'HISTORICAL_CREATE',
          actor_id: person.id,
          payload: {
            originalDate: formData.originalDate,
            originalChannel: formData.originalChannel,
            adminObservations: formData.adminObservations,
            finalStatus: formData.finalStatus
          }
        });

      toast({
        title: "Sucesso",
        description: `Solicitação de ${people.find(p => p.id === formData.requesterId)?.nome} foi registrada no sistema.`,
      });
      
      // Reset form
      setFormData({
        requesterId: "",
        tipo: "",
        inicio: "",
        fim: "",
        justificativa: "",
        originalDate: "",
        originalChannel: "",
        adminObservations: "",
        finalStatus: Status.APROVADO_FINAL
      });
      setStartDate(undefined);
      setEndDate(undefined);
      setOriginalDate(undefined);
      
      onSuccess?.();
    } catch (error: any) {
      console.error('Error creating historical request:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: error?.message || "Erro ao registrar solicitação histórica."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Regularização de Solicitação Histórica</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="requester">Colaborador *</Label>
              <Select 
                value={formData.requesterId} 
                onValueChange={(value) => setFormData({ ...formData, requesterId: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.nome} - {person.cargo || 'Sem cargo'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Ausência *</Label>
              <Select 
                value={formData.tipo} 
                onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                required
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inicio">Data de Início *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      setFormData({ ...formData, inicio: date ? date.toISOString().split('T')[0] : '' });
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fim">Data de Fim *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      setFormData({ ...formData, fim: date ? date.toISOString().split('T')[0] : '' });
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {formData.inicio && formData.fim && (
            <div className="text-sm text-muted-foreground">
              Duração: {calculateDays()} dias
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="justificativa">Justificativa</Label>
            <Textarea
              id="justificativa"
              placeholder="Motivo da ausência (opcional)"
              value={formData.justificativa}
              onChange={(e) => setFormData({ ...formData, justificativa: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="originalChannel">Canal Original *</Label>
              <Select 
                value={formData.originalChannel} 
                onValueChange={(value) => setFormData({ ...formData, originalChannel: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Como foi solicitado?" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGINAL_CHANNELS.map((channel) => (
                    <SelectItem key={channel.value} value={channel.value}>
                      {channel.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="originalDate">Data Original da Solicitação *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !originalDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {originalDate ? format(originalDate, "dd/MM/yyyy", { locale: ptBR }) : "Quando foi solicitado?"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={originalDate}
                    onSelect={(date) => {
                      setOriginalDate(date);
                      setFormData({ ...formData, originalDate: date ? date.toISOString() : '' });
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminObservations">Observações Administrativas</Label>
            <Textarea
              id="adminObservations"
              placeholder="Observações sobre o processo de regularização (opcional)"
              value={formData.adminObservations}
              onChange={(e) => setFormData({ ...formData, adminObservations: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="finalStatus">Status Final *</Label>
            <Select 
              value={formData.finalStatus} 
              onValueChange={(value) => setFormData({ ...formData, finalStatus: value as Status })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Status da regularização" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={Status.APROVADO_FINAL}>Aprovado Final</SelectItem>
                <SelectItem value={Status.REALIZADO}>Realizado</SelectItem>
                <SelectItem value={Status.REPROVADO}>Reprovado</SelectItem>
                <SelectItem value={Status.CANCELADO}>Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-4 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                // Reset form instead of navigating
                setFormData({
                  requesterId: "",
                  tipo: "",
                  inicio: "",
                  fim: "",
                  justificativa: "",
                  originalDate: "",
                  originalChannel: "",
                  adminObservations: "",
                  finalStatus: Status.APROVADO_FINAL
                });
                setStartDate(undefined);
                setEndDate(undefined);
                setOriginalDate(undefined);
              }}
            >
              Limpar Formulário
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !formData.requesterId || !formData.tipo || !formData.inicio || !formData.fim || !formData.originalChannel || !formData.originalDate}
            >
              {isSubmitting ? "Registrando..." : "Registrar Solicitação"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};