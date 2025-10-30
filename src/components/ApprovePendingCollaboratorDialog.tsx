import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PendingPerson, Person, Papel, ModeloContrato, MODELO_CONTRATO_LABELS } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface ApprovePendingCollaboratorDialogProps {
  pending: PendingPerson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ApprovePendingCollaboratorDialog({
  pending,
  open,
  onOpenChange,
  onSuccess,
}: ApprovePendingCollaboratorDialogProps) {
  const { person } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [managers, setManagers] = useState<Person[]>([]);
  const [directorNotes, setDirectorNotes] = useState("");

  const [formData, setFormData] = useState({
    nome: pending.nome,
    email: pending.email,
    cargo: pending.cargo || "",
    local: pending.local || "",
    sub_time: pending.sub_time || "",
    gestor_id: pending.gestor_id,
    data_contrato: pending.data_contrato || "",
    data_nascimento: pending.data_nascimento || "",
    modelo_contrato: pending.modelo_contrato || ModeloContrato.CLT,
  });

  useEffect(() => {
    const fetchManagers = async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, nome, email, papel")
        .eq("ativo", true)
        .in("papel", [Papel.GESTOR, Papel.DIRETOR])
        .order("nome");

      if (!error && data) {
        setManagers(data as Person[]);
      }
    };

    fetchManagers();
  }, []);

  const handleApprove = async () => {
    if (!person?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("approve_pending_person", {
        p_pending_id: pending.id,
        p_reviewer_id: person.id,
        p_director_notes: directorNotes.trim() || null,
        p_nome: formData.nome !== pending.nome ? formData.nome : null,
        p_email: formData.email !== pending.email ? formData.email : null,
        p_cargo: formData.cargo !== pending.cargo ? formData.cargo : null,
        p_local: formData.local !== pending.local ? formData.local : null,
        p_sub_time: formData.sub_time !== pending.sub_time ? formData.sub_time : null,
        p_gestor_id: formData.gestor_id !== pending.gestor_id ? formData.gestor_id : null,
        p_data_contrato: formData.data_contrato !== pending.data_contrato ? formData.data_contrato : null,
        p_data_nascimento: formData.data_nascimento !== pending.data_nascimento ? formData.data_nascimento : null,
        p_modelo_contrato: formData.modelo_contrato !== pending.modelo_contrato ? formData.modelo_contrato : null,
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success) {
        toast({
          title: "Sucesso",
          description: "Colaborador aprovado e cadastrado com sucesso",
        });
        onSuccess?.();
      } else {
        throw new Error(result?.message || "Erro ao aprovar cadastro");
      }
    } catch (error: any) {
      console.error("Error approving:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao aprovar cadastro",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aprovar Cadastro de Colaborador</DialogTitle>
          <DialogDescription>Revise e edite as informações antes de aprovar o cadastro.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Dados Submetidos pelo Gestor
            </div>
            <Separator />
            <div className="grid gap-2 text-sm">
              <div><span className="font-medium">Nome:</span> {pending.nome}</div>
              <div><span className="font-medium">Email:</span> {pending.email}</div>
              <div><span className="font-medium">Cargo:</span> {pending.cargo}</div>
              <div><span className="font-medium">Time:</span> {pending.sub_time}</div>
              <div><span className="font-medium">Gestor:</span> {pending.gestor?.nome}</div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Editar Informações</h4>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cargo">Cargo</Label>
                <Input
                  id="cargo"
                  value={formData.cargo}
                  onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sub_time">Time</Label>
                <Input
                  id="sub_time"
                  value={formData.sub_time}
                  onChange={(e) => setFormData({ ...formData, sub_time: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gestor_id">Gestor Responsável</Label>
                <Select
                  value={formData.gestor_id}
                  onValueChange={(value) => setFormData({ ...formData, gestor_id: value })}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="local">Local</Label>
                <Input
                  id="local"
                  value={formData.local}
                  onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelo_contrato">Modelo de Contrato</Label>
                <Select
                  value={formData.modelo_contrato}
                  onValueChange={(value) => setFormData({ ...formData, modelo_contrato: value as ModeloContrato })}
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

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="data_nascimento">Data de Nascimento</Label>
                <Input
                  id="data_nascimento"
                  type="date"
                  value={formData.data_nascimento}
                  onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações do Diretor (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Adicione observações sobre o cadastro ou mudanças feitas..."
                value={directorNotes}
                onChange={(e) => setDirectorNotes(e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleApprove} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aprovar e Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
