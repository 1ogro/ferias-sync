import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Papel, ModeloContrato, MODELO_CONTRATO_LABELS } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface NewCollaboratorFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface FormData {
  nome: string;
  email: string;
  cargo: string;
  local: string;
  sub_time: string;
  data_contrato: string;
  data_nascimento: string;
  modelo_contrato: ModeloContrato;
  dia_pagamento: string;
}

interface FormErrors {
  nome?: string;
  email?: string;
  cargo?: string;
  sub_time?: string;
}

export function NewCollaboratorForm({ onSuccess, onCancel }: NewCollaboratorFormProps) {
  const { person } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [formData, setFormData] = useState<FormData>({
    nome: "",
    email: "",
    cargo: "",
    local: "",
    sub_time: "",
    data_contrato: "",
    data_nascimento: "",
    modelo_contrato: ModeloContrato.CLT,
    dia_pagamento: "",
  });

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.nome.trim() || formData.nome.trim().length < 3) {
      newErrors.nome = "Nome deve ter no mínimo 3 caracteres";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim() || !emailRegex.test(formData.email.trim())) {
      newErrors.email = "Email inválido";
    }

    if (!formData.cargo.trim() || formData.cargo.trim().length < 2) {
      newErrors.cargo = "Cargo é obrigatório";
    }

    if (!formData.sub_time.trim() || formData.sub_time.trim().length < 2) {
      newErrors.sub_time = "Time é obrigatório";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    if (!person?.id) {
      toast({
        title: "Erro",
        description: "Usuário não identificado",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("pending_people").insert({
        nome: formData.nome.trim(),
        email: formData.email.trim().toLowerCase(),
        cargo: formData.cargo.trim(),
        local: formData.local.trim() || null,
        sub_time: formData.sub_time.trim(),
        papel: Papel.COLABORADOR,
        gestor_id: person.id,
        data_contrato: formData.data_contrato || null,
        data_nascimento: formData.data_nascimento || null,
        modelo_contrato: formData.modelo_contrato,
        dia_pagamento: formData.modelo_contrato === ModeloContrato.PJ && formData.dia_pagamento ? parseInt(formData.dia_pagamento) : null,
        created_by: person.id,
        status: "PENDENTE",
      });

      if (error) throw error;

      // Fire-and-forget: notify directors via email
      supabase.functions.invoke('send-notification-email', {
        body: {
          type: 'NEW_PENDING_PERSON',
          collaboratorName: formData.nome.trim(),
          collaboratorEmail: formData.email.trim().toLowerCase(),
          managerName: person.nome || 'Gestor',
        },
      }).catch(err => console.warn('Failed to send new pending person email:', err));

      // Fire-and-forget: notify via Slack
      supabase.functions.invoke('slack-notification', {
        body: {
          type: 'NEW_PENDING_PERSON',
          personName: formData.nome.trim(),
          personEmail: formData.email.trim().toLowerCase(),
          managerName: person.nome || 'Gestor',
        },
      }).catch(err => console.warn('Failed to send new pending person slack:', err));

      toast({
        title: "Sucesso",
        description: "Cadastro submetido para aprovação do diretor",
      });

      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating pending person:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao cadastrar colaborador",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nome">Nome Completo *</Label>
        <Input
          id="nome"
          value={formData.nome}
          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
          placeholder="João Silva"
          disabled={loading}
        />
        {errors.nome && <p className="text-sm text-destructive">{errors.nome}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="joao@exemplo.com.br"
          disabled={loading}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cargo">Cargo *</Label>
        <Input
          id="cargo"
          value={formData.cargo}
          onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
          placeholder="Product Designer"
          disabled={loading}
        />
        {errors.cargo && <p className="text-sm text-destructive">{errors.cargo}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sub_time">Time *</Label>
        <Input
          id="sub_time"
          value={formData.sub_time}
          onChange={(e) => setFormData({ ...formData, sub_time: e.target.value })}
          placeholder="Pacientes"
          disabled={loading}
        />
        {errors.sub_time && <p className="text-sm text-destructive">{errors.sub_time}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="local">Local</Label>
        <Input
          id="local"
          value={formData.local}
          onChange={(e) => setFormData({ ...formData, local: e.target.value })}
          placeholder="Rio de Janeiro"
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="modelo_contrato">Modelo de Contrato</Label>
        <Select
          value={formData.modelo_contrato}
          onValueChange={(value) => setFormData({ ...formData, modelo_contrato: value as ModeloContrato, dia_pagamento: value !== ModeloContrato.PJ ? "" : formData.dia_pagamento })}
          disabled={loading}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MODELO_CONTRATO_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formData.modelo_contrato === ModeloContrato.PJ && (
        <div className="space-y-2">
          <Label htmlFor="dia_pagamento">Dia de Pagamento</Label>
          <Select
            value={formData.dia_pagamento || "none"}
            onValueChange={(value) => setFormData({ ...formData, dia_pagamento: value === "none" ? "" : value })}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar dia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não definido</SelectItem>
              <SelectItem value="10">Dia 10</SelectItem>
              <SelectItem value="20">Dia 20</SelectItem>
              <SelectItem value="30">Dia 30</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="data_contrato">Data de Contrato</Label>
        <Input
          id="data_contrato"
          type="date"
          value={formData.data_contrato}
          onChange={(e) => setFormData({ ...formData, data_contrato: e.target.value })}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="data_nascimento">Data de Nascimento</Label>
        <Input
          id="data_nascimento"
          type="date"
          value={formData.data_nascimento}
          onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
          disabled={loading}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submeter para Aprovação
        </Button>
      </div>
    </form>
  );
}
