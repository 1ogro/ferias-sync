import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Person } from "@/lib/types";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileModal = ({ open, onOpenChange }: ProfileModalProps) => {
  const { toast } = useToast();
  const { person } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    data_nascimento: undefined as Date | undefined,
  });

  useEffect(() => {
    if (person && open) {
      setFormData({
        nome: person.nome || "",
        email: person.email || "",
        data_nascimento: person.data_nascimento ? new Date(person.data_nascimento) : undefined,
      });
    }
  }, [person, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('people')
        .update({
          nome: formData.nome,
          email: formData.email,
          data_nascimento: formData.data_nascimento?.toISOString().split('T')[0],
        })
        .eq('id', person.id);

      if (error) throw error;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'people',
          entidade_id: person.id,
          acao: 'UPDATE_PROFILE',
          payload: {
            updated_fields: ['nome', 'email', 'data_nascimento'],
            new_values: {
              nome: formData.nome,
              email: formData.email,
              data_nascimento: formData.data_nascimento?.toISOString().split('T')[0] || null
            }
          },
          actor_id: person.id
        });

      toast({
        title: "Perfil atualizado!",
        description: "Suas informações foram salvas com sucesso.",
      });

      onOpenChange(false);
      
      // Refresh the page to update the header info
      window.location.reload();
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

  const getBirthdayThisYear = () => {
    if (!formData.data_nascimento) return null;
    const currentYear = new Date().getFullYear();
    const birthday = new Date(formData.data_nascimento);
    return new Date(currentYear, birthday.getMonth(), birthday.getDate());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Seu nome completo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="seu.email@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Data de Nascimento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.data_nascimento && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.data_nascimento ? (
                    format(formData.data_nascimento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  ) : (
                    <span>Selecione sua data de nascimento</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.data_nascimento}
                  onSelect={(date) => setFormData(prev => ({ ...prev, data_nascimento: date }))}
                  disabled={(date) => date > new Date() || date < new Date("1930-01-01")}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {formData.data_nascimento && (
              <p className="text-sm text-muted-foreground">
                Seu day-off anual será em {getBirthdayThisYear() ? format(getBirthdayThisYear()!, "dd/MM") : 'N/A'} (dia do seu aniversário)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.nome || !formData.email}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};