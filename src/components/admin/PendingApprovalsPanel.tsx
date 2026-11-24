import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Users2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { parseDateSafely } from "@/lib/dateUtils";

const LABELS: Record<string, string> = {
  sub_time: "Time",
  data_contrato: "Data do contrato / aditivo vigente",
  data_admissao: "Data de admissão",
  modelo_contrato: "Modelo de contrato",
  data_nascimento: "Data de nascimento",
  cargo: "Cargo",
  local: "Local",
  dia_pagamento: "Dia de pagamento",
  feedback_reminders_slack: "Cobrança de feedback no Slack",
  feedback_reminders_email: "Cobrança de feedback por e-mail",
};
const KIND_LABELS: Record<string, string> = {
  PROFILE_DATA: "Dados cadastrais",
  VACATION_HISTORICAL: "Férias históricas",
  FEEDBACK_REMINDER_OPTOUT: "Lembretes de feedback",
};

type Req = {
  id: string; kind: string; changes: Record<string, any>; justification: string | null; created_at: string;
  person: Record<string, any> | null; requester: { nome: string } | null;
};

const fmt = (key: string, v: any) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Ligado" : "Desligado";
  if (key.startsWith("data_") && typeof v === "string") {
    const d = parseDateSafely(v);
    return d ? d.toLocaleDateString("pt-BR") : v;
  }
  return String(v);
};

export const isTeamChange = (r: { changes: Record<string, any> }) => "sub_time" in (r.changes || {});

export function usePendingDataChangeCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    (supabase as any).from("data_change_requests").select("id", { count: "exact", head: true })
      .eq("status", "PENDENTE").then(({ count }: any) => setCount(count || 0));
  }, []);
  return count;
}

export function PendingApprovalsPanel({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "team" | "other">("all");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("data_change_requests")
      .select("id, kind, changes, justification, created_at, person:people!data_change_requests_person_id_fkey(nome, sub_time, data_contrato, data_admissao, modelo_contrato, data_nascimento, cargo, local, dia_pagamento), requester:people!data_change_requests_requested_by_fkey(nome)")
      .eq("status", "PENDENTE")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setItems((data || []) as Req[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((r) =>
    filter === "all" ? true : filter === "team" ? isTeamChange(r) : !isTeamChange(r)), [items, filter]);
  const teamCount = items.filter(isTeamChange).length;

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      const { data, error } = await (supabase as any).rpc("review_data_change", {
        p_request_id: id, p_approve: approve, p_notes: notes[id]?.trim() || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Falha ao revisar");
      toast({ title: approve ? "Alteração aprovada" : "Alteração recusada" });
      await load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          Todas <Badge variant="secondary" className="ml-2">{items.length}</Badge>
        </Button>
        <Button size="sm" variant={filter === "team" ? "default" : "outline"} onClick={() => setFilter("team")}>
          Trocas de time <Badge variant="secondary" className="ml-2">{teamCount}</Badge>
        </Button>
        <Button size="sm" variant={filter === "other" ? "default" : "outline"} onClick={() => setFilter("other")}>
          Demais dados <Badge variant="secondary" className="ml-2">{items.length - teamCount}</Badge>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma aprovação pendente.</CardContent></Card>
      ) : filtered.map((r) => {
        const current = r.person || {};
        const team = isTeamChange(r);
        return (
          <Card key={r.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{current.nome || "Colaborador"}</CardTitle>
                <div className="flex gap-2">
                  {team && <Badge><Users2 className="h-3 w-3 mr-1" />Troca de time</Badge>}
                  <Badge variant="outline">{KIND_LABELS[r.kind] || r.kind}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Solicitado por {r.requester?.nome || "—"} em {new Date(r.created_at).toLocaleString("pt-BR")}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {team && (
                <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/50 p-3 text-sm">
                  <span className="font-medium">{current.sub_time || "Sem time"}</span>
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-primary">{r.changes.sub_time || "Sem time"}</span>
                </div>
              )}
              <div className="space-y-1 text-sm">
                {Object.entries(r.changes).filter(([k]) => k !== "sub_time").map(([k, v]) => (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{LABELS[k] || k}:</span>
                    {r.kind === "PROFILE_DATA" && k in current && (
                      <><span className="text-muted-foreground">{fmt(k, current[k])}</span><ArrowRight className="h-3 w-3" /></>
                    )}
                    <span>{fmt(k, v)}</span>
                  </div>
                ))}
              </div>
              {r.justification && <p className="text-sm"><span className="font-medium">Justificativa:</span> {r.justification}</p>}
              <Textarea
                placeholder="Observação da decisão (opcional)"
                value={notes[r.id] || ""}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                rows={2}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => review(r.id, false)}>
                  <XCircle className="h-4 w-4 mr-1" />Recusar
                </Button>
                <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, true)}>
                  <CheckCircle className="h-4 w-4 mr-1" />Aprovar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
