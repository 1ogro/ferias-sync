import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useActivePeople, KudosCategory } from "@/hooks/useEngagement";

export const BISCOITO_CATEGORY: Record<KudosCategory, { label: string; emoji: string }> = {
  teamwork: { label: "Trabalho em equipe", emoji: "🤝" },
  innovation: { label: "Inovação", emoji: "💡" },
  delivery: { label: "Entrega", emoji: "🚀" },
  leadership: { label: "Liderança", emoji: "🏆" },
  customer: { label: "Foco no cliente", emoji: "❤️" },
};

export interface BiscoitoRow {
  id: string;
  from_person_id: string | null;
  to_person_id: string | null;
  from_slack_name: string | null;
  to_slack_name: string | null;
  message: string;
  category: KudosCategory;
  created_at: string;
}

/** Biscoitos involving the given people. direction: received | given | both. Optional [start, end) ISO range. */
export function useBiscoitos(opts: {
  personIds: string[];
  direction: "received" | "given" | "both";
  start?: string;
  end?: string;
  enabled?: boolean;
}) {
  const { personIds, direction, start, end, enabled = true } = opts;
  const key = [...personIds].sort().join(",");
  return useQuery({
    queryKey: ["biscoitos", key, direction, start ?? null, end ?? null],
    enabled: enabled && personIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("kudos")
        .select("id, from_person_id, to_person_id, from_slack_name, to_slack_name, message, category, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      const list = personIds.join(",");
      if (direction === "received") q = q.in("to_person_id", personIds);
      else if (direction === "given") q = q.in("from_person_id", personIds);
      else q = q.or(`to_person_id.in.(${list}),from_person_id.in.(${list})`);
      if (start) q = q.gte("created_at", start);
      if (end) q = q.lt("created_at", end);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BiscoitoRow[];
    },
  });
}

export function BiscoitoList({
  rows,
  isLoading,
  empty = "Nenhum biscoito encontrado.",
}: {
  rows: BiscoitoRow[];
  isLoading?: boolean;
  empty?: string;
}) {
  const { data: people = [] } = useActivePeople();
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.nome])), [people]);
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((k) => {
        const meta = BISCOITO_CATEGORY[k.category] ?? { label: k.category, emoji: "🍪" };
        const from = (k.from_person_id && names.get(k.from_person_id)) || k.from_slack_name || "Alguém";
        const to = (k.to_person_id && names.get(k.to_person_id)) || k.to_slack_name || "?";
        return (
          <li key={k.id} className="border rounded-lg p-3 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <div className="text-sm">
                <span className="font-semibold">{from}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-semibold">{to}</span>
              </div>
              <Badge variant="secondary">{meta.emoji} {meta.label}</Badge>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{k.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(k.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
