import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, AlertTriangle } from "lucide-react";
import { ModeloContrato, MODELO_CONTRATO_LABELS } from "@/lib/types";

const ContractDateSetup = () => {
  const { toast } = useToast();
  const { person, fetchPersonData } = useAuth();
  const [contractDate, setContractDate] = useState("");
  const [modeloContrato, setModeloContrato] = useState<ModeloContrato>(ModeloContrato.CLT);
  const [loading, setLoading] = useState(false);

  const handleSaveContractDate = async () => {
    if (!contractDate) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('set_contract_data_for_current_user', {
        p_date: contractDate,
        p_model: modeloContrato
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Dados contratuais salvos com sucesso!",
      });

      // Refresh person data to update the contract date
      await fetchPersonData();
      
      // Navigate to home page after successful save
      window.location.href = '/';
    } catch (error: any) {
      console.error("Error saving contract data:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar dados contratuais.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Configuração de Contrato</CardTitle>
            <p className="text-muted-foreground mt-2">
              Para calcular corretamente seus saldos de férias, precisamos de alguns dados contratuais.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Olá, {person?.nome}!</strong>
              <br />
              Estas informações são obrigatórias para o funcionamento correto do sistema de gestão de férias.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contract-date">
                Data de Início do Contrato *
              </Label>
              <Input
                id="contract-date"
                type="date"
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
                disabled={loading}
                max={new Date().toISOString().split('T')[0]} // Can't be future date
              />
              <p className="text-sm text-muted-foreground">
                Selecione a data de início do seu contrato de trabalho
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="modeloContrato">Modelo de Contrato *</Label>
              <Select value={modeloContrato} onValueChange={(value: ModeloContrato) => setModeloContrato(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modelo de contrato" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODELO_CONTRATO_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleSaveContractDate}
            disabled={loading || !contractDate}
            className="w-full"
          >
            {loading ? (
              "Salvando..."
            ) : (
              "Continuar para o Sistema"
            )}
          </Button>

          <div className="text-xs text-muted-foreground text-center bg-muted/50 p-3 rounded">
            <strong>Privacidade:</strong> Seus dados contratuais serão usados apenas para cálculos internos de RH e são tratados com total confidencialidade.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContractDateSetup;