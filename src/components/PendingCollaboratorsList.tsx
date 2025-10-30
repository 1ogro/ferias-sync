import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PendingPerson, Papel } from "@/lib/types";
import { PendingCollaboratorCard } from "./PendingCollaboratorCard";
import { ApprovePendingCollaboratorDialog } from "./ApprovePendingCollaboratorDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Filter, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PendingCollaboratorsListProps {
  onCountChange?: (count: number) => void;
}

export function PendingCollaboratorsList({ onCountChange }: PendingCollaboratorsListProps) {
  const { person } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pendingPeople, setPendingPeople] = useState<PendingPerson[]>([]);
  const [selectedForApproval, setSelectedForApproval] = useState<PendingPerson | null>(null);
  const [selectedForRejection, setSelectedForRejection] = useState<PendingPerson | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const isDirector = person?.papel === Papel.DIRETOR || person?.is_admin;

  const fetchPendingPeople = async () => {
    if (!person?.id) return;

    setLoading(true);
    try {
      let query = supabase
        .from("pending_people")
        .select(`
          *,
          gestor:people!pending_people_gestor_id_fkey(id, nome, email),
          creator:people!pending_people_created_by_fkey(id, nome, email)
        `)
        .order("created_at", { ascending: false });

      // Managers only see their own pending submissions
      if (!isDirector) {
        query = query.eq("created_by", person.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData: PendingPerson[] = (data || []).map((item: any) => ({
        id: item.id,
        nome: item.nome,
        email: item.email,
        cargo: item.cargo,
        local: item.local,
        sub_time: item.sub_time,
        papel: item.papel as Papel,
        gestor_id: item.gestor_id,
        gestor: item.gestor,
        data_contrato: item.data_contrato,
        data_nascimento: item.data_nascimento,
        modelo_contrato: item.modelo_contrato,
        status: item.status,
        created_by: item.created_by,
        creator: item.creator,
        created_at: new Date(item.created_at),
        reviewed_by: item.reviewed_by,
        reviewer: item.reviewer,
        reviewed_at: item.reviewed_at ? new Date(item.reviewed_at) : undefined,
        rejection_reason: item.rejection_reason,
        director_notes: item.director_notes,
      }));

      setPendingPeople(formattedData);

      // Notify parent about pending count
      const pendingCount = formattedData.filter((p) => p.status === "PENDENTE").length;
      onCountChange?.(pendingCount);
    } catch (error: any) {
      console.error("Error fetching pending people:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar cadastros pendentes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPeople();
  }, [person?.id]);

  const handleReject = async () => {
    if (!selectedForRejection || !person?.id || !rejectionReason.trim()) return;

    setRejecting(true);
    try {
      const { data, error } = await supabase.rpc("reject_pending_person", {
        p_pending_id: selectedForRejection.id,
        p_reviewer_id: person.id,
        p_rejection_reason: rejectionReason.trim(),
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success) {
        toast({
          title: "Sucesso",
          description: "Cadastro rejeitado",
        });
        fetchPendingPeople();
      } else {
        throw new Error(result?.message || "Erro ao rejeitar cadastro");
      }
    } catch (error: any) {
      console.error("Error rejecting:", error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao rejeitar cadastro",
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
      setSelectedForRejection(null);
      setRejectionReason("");
    }
  };

  const filteredPeople = pendingPeople.filter((p) => {
    const matchesSearch =
      !searchTerm ||
      p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="APROVADO">Aprovado</SelectItem>
            <SelectItem value="REJEITADO">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
        {(searchTerm || statusFilter !== "all") && (
          <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filteredPeople.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {pendingPeople.length === 0 ? "Nenhum cadastro pendente" : "Nenhum cadastro encontrado com os filtros aplicados"}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredPeople.map((pending) => (
            <PendingCollaboratorCard
              key={pending.id}
              pending={pending}
              onApprove={isDirector ? setSelectedForApproval : undefined}
              onReject={isDirector ? setSelectedForRejection : undefined}
              showActions={isDirector && pending.status === "PENDENTE"}
            />
          ))}
        </div>
      )}

      {selectedForApproval && (
        <ApprovePendingCollaboratorDialog
          pending={selectedForApproval}
          open={!!selectedForApproval}
          onOpenChange={(open) => !open && setSelectedForApproval(null)}
          onSuccess={() => {
            setSelectedForApproval(null);
            fetchPendingPeople();
          }}
        />
      )}

      <AlertDialog open={!!selectedForRejection} onOpenChange={(open) => !open && setSelectedForRejection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar Cadastro</AlertDialogTitle>
            <AlertDialogDescription>
              Você está rejeitando o cadastro de <strong>{selectedForRejection?.nome}</strong>.
              Por favor, informe o motivo da rejeição:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder="Digite o motivo da rejeição..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              disabled={rejecting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={rejecting || !rejectionReason.trim()}
              className="bg-destructive hover:bg-destructive/90"
            >
              {rejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rejeitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
