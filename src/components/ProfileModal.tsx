import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedCalendar } from "@/components/ui/enhanced-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Send, Mail, Figma, KeyRound, Unlink, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useIntegrations } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { Person } from "@/lib/types";
import { formatDateToBRString, parseBRStringToDate, applyDateMask, isValidDateString, formatDateToYYYYMMDD, parseDateSafely } from "@/lib/dateUtils";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileModal = ({ open, onOpenChange }: ProfileModalProps) => {
  const { toast } = useToast();
  const { person, user, signInWithFigma } = useAuth();
  const { settings: integrationSettings } = useIntegrations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    data_nascimento: undefined as Date | undefined,
  });
  const [birthdateInput, setBirthdateInput] = useState("");
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [desiredPaymentDay, setDesiredPaymentDay] = useState<string>("");
  const [isRequestingChange, setIsRequestingChange] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [unlinkingIdentity, setUnlinkingIdentity] = useState<string | null>(null);

  const isFigmaEnabled = integrationSettings?.figma_enabled === true &&
    (integrationSettings?.figma_status === 'active' || integrationSettings?.figma_status === 'configured');

  const identities = user?.identities || [];
  const hasEmailIdentity = identities.some(i => i.provider === 'email');
  const hasFigmaIdentity = identities.some(i => i.provider === 'figma');

  useEffect(() => {
    if (person && open) {
      const birthDate = person.data_nascimento ? parseDateSafely(person.data_nascimento) : undefined;
      setFormData({
        nome: person.nome || "",
        email: person.email || "",
        data_nascimento: birthDate,
      });
      setBirthdateInput(formatDateToBRString(birthDate));
      setShowChangeRequest(false);
      setDesiredPaymentDay("");
    }
  }, [person, open]);

  const handleBirthdateInputChange = (value: string) => {
    const maskedValue = applyDateMask(value);
    setBirthdateInput(maskedValue);
    if (maskedValue.length === 10) {
      const parsed = parseBRStringToDate(maskedValue);
      if (parsed) {
        setFormData(prev => ({ ...prev, data_nascimento: parsed }));
      }
    } else {
      setFormData(prev => ({ ...prev, data_nascimento: undefined }));
    }
  };

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
        p_data_nascimento: formData.data_nascimento ? formatDateToYYYYMMDD(formData.data_nascimento) : null,
      });
      if (error) throw error;
      toast({ title: "Perfil atualizado!", description: "Suas informações foram salvas com sucesso." });
      onOpenChange(false);
      window.location.reload();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestPaymentDayChange = async () => {
    if (!person || !desiredPaymentDay) return;
    setIsRequestingChange(true);
    try {
      const { data: directors, error: dirError } = await supabase
        .from('people')
        .select('email')
        .eq('papel', 'DIRETOR')
        .eq('ativo', true);

      if (dirError) throw dirError;

      if (!directors || directors.length === 0) {
        toast({ title: "Erro", description: "Nenhum diretor encontrado para enviar a solicitação.", variant: "destructive" });
        return;
      }

      // Send email to each director
      for (const director of directors) {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'PAYMENT_DAY_CHANGE_REQUEST',
            to: director.email,
            requesterName: person.nome,
            currentPaymentDay: person.dia_pagamento,
            desiredPaymentDay: Number(desiredPaymentDay),
          },
        });
      }

      toast({ title: "Solicitação enviada!", description: "Os diretores foram notificados sobre sua solicitação de alteração." });
      setShowChangeRequest(false);
      setDesiredPaymentDay("");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message || "Erro ao enviar solicitação.", variant: "destructive" });
    } finally {
      setIsRequestingChange(false);
    }
  };

  const getBirthdayThisYear = () => {
    if (!formData.data_nascimento) return null;
    const currentYear = new Date().getFullYear();
    const birthday = parseDateSafely(formData.data_nascimento);
    return new Date(currentYear, birthday.getMonth(), birthday.getDate());
  };

  const isPJ = person?.modelo_contrato === 'PJ';

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
                  <Button variant="outline" size="icon" className="shrink-0">
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
                Você pode solicitar day-off a qualquer momento após seu aniversário ({getBirthdayThisYear() ? format(getBirthdayThisYear()!, "dd/MM") : 'N/A'})
              </p>
            )}
          </div>

          {isPJ && (
            <div className="space-y-2">
              <Label>Dia de Pagamento</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {person?.dia_pagamento ? `Dia ${person.dia_pagamento}` : 'Não definido'}
                </Badge>
                {!showChangeRequest && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChangeRequest(true)}
                    className="text-xs"
                  >
                    Solicitar alteração
                  </Button>
                )}
              </div>
              
              {showChangeRequest && (
                <div className="flex items-end gap-2 p-3 rounded-md border bg-muted/50">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Novo dia desejado</Label>
                    <Select value={desiredPaymentDay} onValueChange={setDesiredPaymentDay}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {[10, 20, 30]
                          .filter(d => d !== person?.dia_pagamento)
                          .map(d => (
                            <SelectItem key={d} value={d.toString()}>Dia {d}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!desiredPaymentDay || isRequestingChange}
                    onClick={handleRequestPaymentDayChange}
                    className="h-8"
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {isRequestingChange ? "Enviando..." : "Enviar"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowChangeRequest(false); setDesiredPaymentDay(""); }}
                    className="h-8"
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Auth Methods Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Métodos de Login</Label>
            
            <div className="space-y-2">
              {identities.map((identity) => {
                const providerLabel = identity.provider === 'email' ? 'Email / Senha' : identity.provider === 'figma' ? 'Figma' : identity.provider;
                const ProviderIcon = identity.provider === 'figma' ? Figma : Mail;
                const canUnlink = identities.length > 1;

                return (
                  <div key={identity.id} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <ProviderIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{providerLabel}</span>
                      <Badge variant="secondary" className="text-xs">Vinculado</Badge>
                    </div>
                    {canUnlink && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={unlinkingIdentity === identity.id}
                        onClick={async () => {
                          setUnlinkingIdentity(identity.id);
                          try {
                            const { error } = await supabase.auth.unlinkIdentity(identity as any);
                            if (error) throw error;
                            toast({ title: "Desvinculado!", description: `Login via ${providerLabel} removido.` });
                          } catch (err: any) {
                            toast({ title: "Erro", description: err.message, variant: "destructive" });
                          } finally {
                            setUnlinkingIdentity(null);
                          }
                        }}
                      >
                        <Unlink className="h-3 w-3 mr-1" />
                        {unlinkingIdentity === identity.id ? "..." : "Desvincular"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add password login */}
            {!hasEmailIdentity && (
              <div className="space-y-2">
                {!showSetPassword ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowSetPassword(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar login com senha
                  </Button>
                ) : (
                  <div className="p-3 rounded-md border bg-muted/50 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Nova senha</Label>
                      <Input type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Confirmar senha</Label>
                      <Input type="password" placeholder="••••••••" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={settingPassword || !newPassword || newPassword !== confirmNewPassword || newPassword.length < 6}
                        onClick={async () => {
                          setSettingPassword(true);
                          try {
                            const { error } = await supabase.auth.updateUser({ password: newPassword });
                            if (error) throw error;
                            toast({ title: "Senha definida!", description: "Agora você pode fazer login com email e senha." });
                            setShowSetPassword(false);
                            setNewPassword("");
                            setConfirmNewPassword("");
                          } catch (err: any) {
                            toast({ title: "Erro", description: err.message, variant: "destructive" });
                          } finally {
                            setSettingPassword(false);
                          }
                        }}
                      >
                        {settingPassword ? "Salvando..." : "Definir senha"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setShowSetPassword(false); setNewPassword(""); setConfirmNewPassword(""); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Link Figma */}
            {isFigmaEnabled && !hasFigmaIdentity && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { error } = await signInWithFigma();
                    if (error) throw error;
                  } catch (err: any) {
                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                  }
                }}
              >
                <Figma className="h-3 w-3 mr-1" />
                Vincular Figma
              </Button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
