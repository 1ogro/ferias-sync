import { useState, useEffect } from "react";
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
  isDirector?: boolean;
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
  papel: Papel;
  gestor_id: string;
}

interface FormErrors {
  nome?: string;
  email?: string;
  cargo?: string;
  sub_time?: string;
  gestor_id?: string;
}

interface ManagerOption {
  id: string;
  nome: string;
  papel: string;
}

export function NewCollaboratorForm({ isDirector = false, onSuccess, onCancel }: NewCollaboratorFormProps) {
  const { person } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [managers, setManagers] = useState<ManagerOption[]>([]);

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
    papel: Papel.COLABORADOR,
    gestor_id: "",
  });

  // Load managers list for director's gestor_id picker
  useEffect(() => {
    if (!isDirector) return;
    const fetchManagers = async () => {
      const { data } = await supabase
        .from("people")
        .select("id, nome, papel")
        .in("papel", ["GESTOR", "DIRETOR"])
        .eq("ativo", true)
        .order("nome");
      setManagers(data || []);
    };
    fetchManagers();
  }, [isDirector]);

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

    if (isDirector && formData.papel === Papel.COLABORADOR && !formData.gestor_id) {
      newErrors.gestor_id = "Selecione o gestor responsável";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (!person?.id) {
      toast({ title: "Erro", description: "Usuário não identificado", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const gestorId = isDirector
        ? (formData.papel === Papel.COLABORADOR ? formData.gestor_id : person.id)
        : person.id;

      const papelValue = isDirector ? formData.papel : Papel.COLABORADOR;

      const { data: insertedRows, error } = await supabase.from("pending_people").insert({
        nome: formData.nome.trim(),
        email: formData.email.trim().toLowerCase(),
        cargo: formData.cargo.trim(),
        local: formData.local.trim() || null,
        sub_time: formData.sub_time.trim(),
        papel: papelValue,
        gestor_id: gestorId,
        data_contrato: formData.data_contrato || null,
        data_nascimento: formData.data_nascimento || null,
        modelo_contrato: formData.modelo_contrato,
        dia_pagamento: formData.modelo_contrato === ModeloContrato.PJ && formData.dia_pagamento ? parseInt(formData.dia_pagamento) : null,
        created_by: person.id,
        status: "PENDENTE",
      }).select();

      if (error) throw error;

      // If director, auto-approve immediately
      if (isDirector && insertedRows && insertedRows.length > 0) {
        const pendingId = insertedRows[0].id;
        const { data: approveResult, error: approveError } = await supabase.rpc("approve_pending_person", {
          p_pending_id: pendingId,
          p_reviewer_id: person.id,
          p_director_notes: "Cadastro direto pelo diretor",
          p_nome: formData.nome.trim(),
          p_email: formData.email.trim().toLowerCase(),
          p_cargo: formData.cargo.trim(),
          p_local: formData.local.trim() || null,
          p_sub_time: formData.sub_time.trim(),
          p_gestor_id: gestorId,
          p_data_contrato: formData.data_contrato || null,
          p_data_nascimento: formData.data_nascimento || null,
          p_modelo_contrato: formData.modelo_contrato,
          p_dia_pagamento: formData.modelo_contrato === ModeloContrato.PJ && formData.dia_pagamento ? parseInt(formData.dia_pagamento) : null,
        });

        if (approveError) throw approveError;

        const result = approveResult as unknown as { success: boolean; message: string };
        if (!result.success) {
          throw new Error(result.message);
        }
      }

      // Fire-and-forget notifications (only for manager flow)
      if (!isDirector) {
        supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'NEW_PENDING_PERSON',
            collaboratorName: formData.nome.trim(),
            collaboratorEmail: formData.email.trim().toLowerCase(),
            managerName: person.nome || 'Gestor',
          },
        }).catch(err => console.warn('Failed to send new pending person email:', err));

        supabase.functions.invoke('slack-notification', {
          body: {
            type: 'NEW_PENDING_PERSON',
            personName: formData.nome.trim(),
            personEmail: formData.email.trim().toLowerCase(),
            managerName: person.nome || 'Gestor',
          },
        }).catch(err => console.warn('Failed to send new pending person slack:', err));
      }

      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating collaborator:", error);
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

      {isDirector && (
        <div className="space-y-2">
          <Label htmlFor="papel">Papel *</Label>
          <Select
            value={formData.papel}
            onValueChange={(value) => setFormData({ ...formData, papel: value as Papel, gestor_id: value !== Papel.COLABORADOR ? "" : formData.gestor_id })}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={Papel.COLABORADOR}>Colaborador</SelectItem>
              <SelectItem value={Papel.GESTOR}>Gestor</SelectItem>
              <SelectItem value={Papel.DIRETOR}>Diretor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isDirector && formData.papel === Papel.COLABORADOR && (
        <div className="space-y-2">
          <Label htmlFor="gestor_id">Gestor Responsável *</Label>
          <Select
            value={formData.gestor_id || "none"}
            onValueChange={(value) => setFormData({ ...formData, gestor_id: value === "none" ? "" : value })}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar gestor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Selecionar...</SelectItem>
              {managers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome} ({m.papel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.gestor_id && <p className="text-sm text-destructive">{errors.gestor_id}</p>}
        </div>
      )}

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
          {isDirector ? "Cadastrar Colaborador" : "Submeter para Aprovação"}
        </Button>
      </div>
    </form>
  );
}
