import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { recalculateVacationBalance } from "@/lib/vacationUtils";
import { Calculator, Loader2 } from "lucide-react";

interface VacationBalanceRecalculateProps {
  personId: string;
  personName: string;
  year: number;
  onSuccess: () => void;
}

export const VacationBalanceRecalculate = ({ 
  personId, 
  personName, 
  year, 
  onSuccess 
}: VacationBalanceRecalculateProps) => {
  const { toast } = useToast();
  const { person } = useAuth();
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRecalculate = async () => {
    if (!person || !justification.trim()) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Justificativa é obrigatória para recalcular o saldo."
      });
      return;
    }

    setLoading(true);
    try {
      const result = await recalculateVacationBalance(
        personId,
        year,
        justification.trim(),
        person.id
      );

      if (result.success) {
        toast({
          title: "Sucesso",
          description: `Saldo de férias de ${personName} foi recalculado automaticamente.`
        });
        setOpen(false);
        setJustification("");
        onSuccess();
      } else {
        toast({
          variant: "destructive",
          title: "Erro",
          description: result.error || "Erro ao recalcular saldo."
        });
      }
    } catch (error) {
      console.error("Error recalculating balance:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro interno ao recalcular saldo."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Calculator className="w-3 h-3 mr-1" />
          Recalcular
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Recalcular Saldo Automaticamente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p><strong>Colaborador:</strong> {personName}</p>
            <p><strong>Ano:</strong> {year}</p>
            <p className="mt-2">
              O sistema irá recalcular o saldo baseado na data de contrato e 
              solicitações aprovadas/realizadas, incluindo registros históricos.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="justification">
              Justificativa para Recálculo *
            </Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Recálculo após inclusão de solicitações históricas..."
              className="min-h-[80px]"
            />
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setJustification("");
              }}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRecalculate}
              disabled={loading || !justification.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Recalculando...
                </>
              ) : (
                <>
                  <Calculator className="w-4 h-4 mr-2" />
                  Recalcular Saldo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};