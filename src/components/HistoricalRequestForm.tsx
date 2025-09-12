import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TipoAusencia, Status } from "@/lib/types";
import { Calendar, AlertTriangle, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface FormData {
  requesterId: string;
  tipo: TipoAusencia | "";
  inicio: string;
  fim: string;
  justificativa: string;
  originalDate: string;
  originalChannel: string;
  adminObservations: string;
  finalStatus: Status;
}

const HISTORICAL_STATUSES = [
  { value: Status.APROVADO_FINAL, label: "Aprovado Final" },
  { value: Status.REALIZADO, label: "Realizado" },
  { value: Status.REPROVADO, label: "Reprovado" },
  { value: Status.CANCELADO, label: "Cancelado" }
];

const ORIGINAL_CHANNELS = [
  "E-mail",
  "WhatsApp",
  "Presencial",
  "Telefone",
  "Sistema Antigo",
  "Outro"
];

interface SimplePerson {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  sub_time: string | null;
}

export const HistoricalRequestForm = () => {
  const { toast } = useToast();
  const { person } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => {
    fetchActivePeople();
  }, []);

  const fetchActivePeople = async () => {
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
        variant: 'destructive',
        title: 'Erro ao carregar pessoas',
        description: 'Não foi possível carregar a lista de funcionários.',
      });
    }
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
      // Create the historical request
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
          created_at: formData.originalDate,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Create approval record if the request was approved
      if (formData.finalStatus === Status.APROVADO_FINAL || formData.finalStatus === Status.REALIZADO) {
        await supabase
          .from('approvals')
          .insert({
            request_id: newRequest.id,
            approver_id: person.id,
            acao: 'APROVADO',
            level: 'CADASTRO_HISTORICO',
            comentario: `Cadastro histórico - Canal original: ${formData.originalChannel}. ${formData.adminObservations}`
          });
      }

      // Create comprehensive audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: newRequest.id,
          acao: 'HISTORICAL_CREATE',
          payload: {
            tipo: formData.tipo,
            inicio: formData.inicio,
            fim: formData.fim,
            original_date: formData.originalDate,
            original_channel: formData.originalChannel,
            final_status: formData.finalStatus,
            created_by_director: person.id,
            requester_id: formData.requesterId,
            is_historical: true
          },
          actor_id: person.id
        });

      toast({
        title: "Solicitação histórica cadastrada!",
        description: `Solicitação de ${people.find(p => p.id === formData.requesterId)?.nome} foi registrada no sistema.`,
      });
      
      navigate('/admin');
    } catch (error: any) {
      console.error('Error creating historical request:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao cadastrar solicitação histórica",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPerson = people.find(p => p.id === formData.requesterId);
  const isFormValid = formData.requesterId && formData.tipo && formData.inicio && 
    formData.fim && formData.justificativa && formData.originalDate && 
    formData.originalChannel && formData.adminObservations;

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Cadastro de Solicitação Histórica
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Registre solicitações feitas antes da implementação do sistema atual
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Requester Selection */}
            <div className="space-y-2">
              <Label htmlFor="requesterId">Solicitante *</Label>
              <Select 
                value={formData.requesterId} 
                onValueChange={(value) => handleInputChange("requesterId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.nome} - {person.cargo || 'N/A'} ({person.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPerson && (
                <div className="text-sm text-muted-foreground">
                  Sub-time: {selectedPerson.sub_time || 'N/A'}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
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
                      <SelectItem value={TipoAusencia.LICENCA_MEDICA}>Licença Médica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inicio">Data de Início *</Label>
                    <Input
                      id="inicio"
                      type="date"
                      value={formData.inicio}
                      onChange={(e) => handleInputChange("inicio", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fim">Data de Fim *</Label>
                    <Input
                      id="fim"
                      type="date"
                      value={formData.fim}
                      onChange={(e) => handleInputChange("fim", e.target.value)}
                      min={formData.inicio}
                      disabled={formData.tipo === TipoAusencia.DAYOFF}
                    />
                  </div>
                </div>

                {/* Duration Display */}
                {calculateDays() > 0 && (
                  <Alert>
                    <Calendar className="w-4 h-4" />
                    <AlertDescription>
                      <strong>Duração:</strong> {calculateDays()} dia{calculateDays() > 1 ? 's' : ''}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Final Status */}
                <div className="space-y-2">
                  <Label htmlFor="finalStatus">Status Final *</Label>
                  <Select 
                    value={formData.finalStatus} 
                    onValueChange={(value) => handleInputChange("finalStatus", value as Status)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status final" />
                    </SelectTrigger>
                    <SelectContent>
                      {HISTORICAL_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Original Creation Date */}
                <div className="space-y-2">
                  <Label htmlFor="originalDate">Data Original da Solicitação *</Label>
                  <Input
                    id="originalDate"
                    type="datetime-local"
                    value={formData.originalDate}
                    onChange={(e) => handleInputChange("originalDate", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Quando a solicitação foi originalmente feita
                  </p>
                </div>

                {/* Original Channel */}
                <div className="space-y-2">
                  <Label htmlFor="originalChannel">Canal Original *</Label>
                  <Select 
                    value={formData.originalChannel} 
                    onValueChange={(value) => handleInputChange("originalChannel", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Por qual meio foi solicitado?" />
                    </SelectTrigger>
                    <SelectContent>
                      {ORIGINAL_CHANNELS.map((channel) => (
                        <SelectItem key={channel} value={channel}>
                          {channel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Justification */}
                <div className="space-y-2">
                  <Label htmlFor="justificativa">Justificativa Original *</Label>
                  <Textarea
                    id="justificativa"
                    value={formData.justificativa}
                    onChange={(e) => handleInputChange("justificativa", e.target.value)}
                    placeholder="Justificativa original da solicitação..."
                    rows={3}
                  />
                </div>

                {/* Admin Observations */}
                <div className="space-y-2">
                  <Label htmlFor="adminObservations">Observações Administrativas *</Label>
                  <Textarea
                    id="adminObservations"
                    value={formData.adminObservations}
                    onChange={(e) => handleInputChange("adminObservations", e.target.value)}
                    placeholder="Contexto adicional, aprovações verbais, documentos relacionados..."
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Warning Alert */}
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                <strong>Atenção:</strong> Este cadastro será registrado no sistema de auditoria como uma entrada histórica.
                Certifique-se de que todas as informações estão corretas antes de prosseguir.
              </AlertDescription>
            </Alert>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => navigate('/admin')}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={!isFormValid || isSubmitting}
              >
                {isSubmitting ? "Cadastrando..." : "Cadastrar Solicitação Histórica"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};