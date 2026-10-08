import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserMinus } from "lucide-react";

type Row = {
  id: string; person_id: string; requested_by: string; reason: string; last_day: string | null;
  new_manager_id: string | null; status: string; director_notes: string | null; admin_notes: string | null;
  created_at: string;
  person: { nome: string } | null; requester: { nome: string } | null;
};
type P = { id: string; nome: string; papel: string | null; gestor_id: string | null; sub_time: string | null };

const STATUS: Record<string, string> = {
  PENDENTE_DIRETOR: "Aguardando diretoria",
  PENDENTE_ADMIN: "Aguardando admin",
  CONCLUIDO: "Concluído",
  REJEITADO: "Recusado",
  CANCELADO: "Cancelado",
};

export function OffboardingCard() {
  const { person } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState<P[]>([]);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [newManager, setNewManager] = useState("none");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const isAdmin = !!(person as any)?.is_admin || person?.papel === "ADMIN";
  const isDirector = person?.papel === "DIRETOR" || isAdmin;
  const isLeader = ["GESTOR", "GERENTE", "DIRETOR", "ADMIN"].includes(person?.papel || "") || isAdmin;

  const load = async () => {
    const [{ data: r }, { data: p }] = await Promise.all([
      (supabase as any).from("offboarding_requests")
        .select("*, person:people!offboarding_requests_person_id_fkey(nome), requester:people!offboarding_requests_requested_by_fkey(nome)")
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("people").select("id, nome, papel, gestor_id, sub_time").eq("ativo", true).order("nome"),
    ]);
    setRows((r || []) as Row[]);
    setPeople((p || []) as P[]);
  };
  useEffect(() => { if (person) load(); }, [person?.id]);

  if (!person || !isLeader) return null;

  const eligible = people.filter((p) => p.id !== person.id && (
    isDirector || p.gestor_id === person.id ||
    (person.papel === "GERENTE" && p.sub_time && p.sub_time === (person as any).subTime)
  ));
  const leaders = people.filter((p) => ["GESTOR", "GERENTE", "DIRETOR", "ADMIN"].includes(p.papel || "") && p.id !== target);

  const call = async (key: string, fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(key);
    try {
      const { data, error } = await (supabase as any).rpc(fn, args);
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Não foi possível concluir");
      toast({ title: ok });
      await load();
      return true;
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      return false;
    } finally { setBusy(null); }
  };

  const submit = async () => {
    const ok = await call("new", "request_offboarding", {
      p_person_id: target, p_reason: reason, p_last_day: lastDay || null,
      p_new_manager_id: newManager === "none" ? null : newManager,
    }, "Desligamento solicitado");
    if (ok) { setTarget(""); setReason(""); setLastDay(""); setNewManager("none"); }
  };

  const canReview = (r: Row) =>
    (r.status === "PENDENTE_DIRETOR" && isDirector) || (r.status === "PENDENTE_ADMIN" && isAdmin);
  const open = rows.filter((r) => r.status.startsWith("PENDENTE"));
  const done = rows.filter((r) => !r.status.startsWith("PENDENTE")).slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserMinus className="h-5 w-5" /> Desligamentos</CardTitle>
        <CardDescription>Gestor solicita → diretoria aprova → admin confirma. O histórico da pessoa é preservado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Colaborador</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{eligible.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Último dia</Label>
            <Input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Novo gestor dos liderados (se houver)</Label>
            <Select value={newManager} onValueChange={setNewManager}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não se aplica</SelectItem>
                {leaders.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo do desligamento" />
          </div>
          <div className="md:col-span-2">
            <Button onClick={submit} disabled={!target || reason.trim().length < 5 || busy === "new"}>Solicitar desligamento</Button>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-medium">Em andamento ({open.length})</h4>
          {open.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma solicitação aberta.</p>}
          {open.map((r) => (
            <div key={r.id} className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.person?.nome}</span>
                <Badge variant="secondary">{STATUS[r.status]}</Badge>
                <span className="text-xs text-muted-foreground">
                  por {r.requester?.nome}{r.last_day ? ` · último dia ${r.last_day.split("-").reverse().join("/")}` : ""}
                </span>
              </div>
              <p className="text-sm">{r.reason}</p>
              {r.director_notes && <p className="text-xs text-muted-foreground">Diretoria: {r.director_notes}</p>}
              {canReview(r) && (
                <div className="space-y-2">
                  <Textarea placeholder="Observações (obrigatório para recusar)" value={notes[r.id] || ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy === r.id}
                      onClick={() => call(r.id, "review_offboarding", { p_request_id: r.id, p_approve: true, p_notes: notes[r.id] || null },
                        r.status === "PENDENTE_ADMIN" ? "Desligamento concluído" : "Aprovado e enviado ao admin")}>
                      {r.status === "PENDENTE_ADMIN" ? "Confirmar desligamento" : "Aprovar"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === r.id}
                      onClick={() => call(r.id, "review_offboarding", { p_request_id: r.id, p_approve: false, p_notes: notes[r.id] || null }, "Solicitação recusada")}>
                      Recusar
                    </Button>
                  </div>
                </div>
              )}
              {(r.requested_by === person.id || isDirector) && (
                <Button size="sm" variant="ghost" disabled={busy === r.id}
                  onClick={() => call(r.id, "cancel_offboarding", { p_request_id: r.id }, "Solicitação cancelada")}>
                  Cancelar solicitação
                </Button>
              )}
            </div>
          ))}
        </div>

        {done.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Histórico</h4>
            {done.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{r.person?.nome}</span>
                <Badge variant="outline">{STATUS[r.status]}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
