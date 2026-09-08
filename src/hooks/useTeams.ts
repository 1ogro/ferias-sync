import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Team {
  id: string;
  nome: string;
  ativo: boolean;
}

export function useTeams(includeInactive = false) {
  return useQuery({
    queryKey: ["teams", includeInactive],
    queryFn: async (): Promise<Team[]> => {
      let query = (supabase as any).from("teams").select("id, nome, ativo").order("nome");
      if (!includeInactive) query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Team[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const clean = nome.trim();
      if (clean.length < 2) throw new Error("Informe um nome de time válido.");
      const { data, error } = await (supabase as any)
        .from("teams")
        .insert({ nome: clean })
        .select("id, nome, ativo")
        .single();
      if (error) {
        if ((error as any).code === "23505") throw new Error("Já existe um time com esse nome.");
        throw error;
      }
      return data as Team;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useRenameTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const clean = nome.trim();
      if (clean.length < 2) throw new Error("Informe um nome de time válido.");
      const { error } = await (supabase as any).from("teams").update({ nome: clean }).eq("id", id);
      if (error) {
        if ((error as any).code === "23505") throw new Error("Já existe um time com esse nome.");
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useToggleTeamActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await (supabase as any).from("teams").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}
