import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TipoAusencia } from "@/lib/types";
import { Calendar, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface FormData {
  tipo: TipoAusencia | "";
  inicio: string;
  fim: string;
  justificativa: string;
}

export const NewRequestForm = () => {
  const { toast } = useToast();
  const { person } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    tipo: "",
    inicio: "",
    fim: "", 
    justificativa: ""
  });
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check for conflicts
  const checkConflicts = async () => {
    if (!formData.inicio || !formData.fim || !person) return;

    try {
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
        const conflictNames = data.map(req => `${req.people.nome} (${new Date(req.inicio).toLocaleDateString('pt-BR')} - ${new Date(req.fim).toLocaleDateString('pt-BR')})`);
        setConflicts(conflictNames);
      } else {
        setConflicts([]);
      }
    } catch (error) {
      console.error('Error checking conflicts:', error);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === "inicio" || field === "fim") {
      setTimeout(checkConflicts, 500); // Debounced conflict check
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
    if (!person) return;
    
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('requests')
        .insert({
          requester_id: person.id,
          tipo: formData.tipo,
          inicio: formData.inicio,
          fim: formData.fim,
          justificativa: formData.justificativa,
          conflito_flag: conflicts.length > 0,
          conflito_refs: conflicts.join('; '),
          status: 'PENDENTE'
        });

      if (error) throw error;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: 'new_request',
          acao: 'CREATE',
          payload: { tipo: formData.tipo, inicio: formData.inicio, fim: formData.fim },
          actor_id: person.id
        });

      toast({
        title: "Solicitação enviada!",
        description: "Seu gestor receberá uma notificação para aprovação.",
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

  const isValid = formData.tipo && formData.inicio && formData.fim && formData.justificativa;

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
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inicio">Data de Início *</Label>
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
                />
              </div>
            </div>

            {/* Duration Display */}
            {calculateDays() > 0 && (
              <Alert>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription>
                  <strong>Duração:</strong> {calculateDays()} dia{calculateDays() > 1 ? 's' : ''}
                  {formData.tipo === TipoAusencia.FERIAS && calculateDays() > 30 && (
                    <Badge variant="outline" className="ml-2 bg-status-rejected/10 text-status-rejected">
                      Período superior a 30 dias
                    </Badge>
                  )}
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
                disabled={!isValid || isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? "Enviando..." : "Enviar Solicitação"}
              </Button>
              <Button type="button" variant="outline">
                Salvar Rascunho
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};