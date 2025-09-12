import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, AlertTriangle } from "lucide-react";

const ContractDateSetup = () => {
  const { toast } = useToast();
  const { person, fetchPersonData } = useAuth();
  const [contractDate, setContractDate] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSaveContractDate = async () => {
    if (!contractDate) {
      toast({
        title: "Erro",
        description: "Por favor, selecione a data de contrato.",
        variant: "destructive",
      });
      return;
    }

    if (!person) {
      toast({
        title: "Erro",
        description: "Dados do usuário não encontrados.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('people')
        .update({ data_contrato: contractDate })
        .eq('id', person.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Data de contrato registrada com sucesso!",
      });

      // Refresh person data to update the contract date
      await fetchPersonData();
    } catch (error: any) {
      console.error("Error saving contract date:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar data de contrato.",
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
            <CardTitle className="text-2xl">Configuração Obrigatória</CardTitle>
            <p className="text-muted-foreground mt-2">
              Para calcular corretamente seus saldos de férias, precisamos da sua data de contrato
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Olá, {person?.nome}!</strong>
              <br />
              Esta informação é necessária para acessar o sistema e calcular automaticamente seus direitos trabalhistas.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="contract-date">
              Data de Contrato *
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
            <strong>Privacidade:</strong> Esta informação é usada apenas para cálculos internos de RH e é tratada com total confidencialidade.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContractDateSetup;