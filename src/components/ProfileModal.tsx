import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EnhancedCalendar } from "@/components/ui/enhanced-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Person } from "@/lib/types";
import { formatDateToBRString, parseBRStringToDate, applyDateMask, isValidDateString } from "@/lib/dateUtils";

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
  const [birthdateInput, setBirthdateInput] = useState("");

  useEffect(() => {
    if (person && open) {
      const birthDate = person.data_nascimento ? new Date(person.data_nascimento) : undefined;
      setFormData({
        nome: person.nome || "",
        email: person.email || "",
        data_nascimento: birthDate,
      });
      setBirthdateInput(formatDateToBRString(birthDate));
    }
  }, [person, open]);

  // Handle text input changes with mask
  const handleBirthdateInputChange = (value: string) => {
    const maskedValue = applyDateMask(value);
    setBirthdateInput(maskedValue);
    
    // Try to parse and update date if valid
    if (maskedValue.length === 10) {
      const parsed = parseBRStringToDate(maskedValue);
      if (parsed) {
        setFormData(prev => ({ ...prev, data_nascimento: parsed }));
      }
    } else {
      setFormData(prev => ({ ...prev, data_nascimento: undefined }));
    }
  };

  // Handle calendar selection
  const handleCalendarSelect = (date: Date | undefined) => {
    setFormData(prev => ({ ...prev, data_nascimento: date }));
    setBirthdateInput(formatDateToBRString(date));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase.rpc('update_profile_for_current_user', {
        p_nome: formData.nome,
        p_email: formData.email,
        p_data_nascimento: formData.data_nascimento?.toISOString().split('T')[0] || null,
      });

      if (error) throw error;

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
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="DD/MM/AAAA"
                  value={birthdateInput}
                  onChange={(e) => handleBirthdateInputChange(e.target.value)}
                  maxLength={10}
                  className={cn(
                    birthdateInput && !isValidDateString(birthdateInput) && "border-destructive"
                  )}
                />
                {birthdateInput && !isValidDateString(birthdateInput) && birthdateInput.length === 10 && (
                  <p className="text-xs text-destructive mt-1">Data inválida</p>
                )}
              </div>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <EnhancedCalendar
                    mode="single"
                    selected={formData.data_nascimento}
                    onSelect={handleCalendarSelect}
                    disabled={(date) => date > new Date() || date < new Date("1930-01-01")}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
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