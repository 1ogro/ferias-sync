import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Search, X } from "lucide-react";
import { formatDateSafe } from "@/lib/dateUtils";

type Row = {
  key: string;
  kind: "pending_merge" | "slack_link";
  nome: string | null;
  email: string | null;
  slack_user_id: string | null;
  person_id: string | null;
  person_nome: string | null;
  when: string | null;
  source: string | null;
  extra: string | null;
};

export default function AdminMergedPeople() {
  const { user, person, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [fetching, setFetching] = useState(true);
  const [emailFilter, setEmailFilter] = useState("");
  const [slackFilter, setSlackFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "pending_merge" | "slack_link">("all");

  const isDirector = person?.papel === "DIRETOR" || person?.is_admin === true;

  useEffect(() => {
    const load = async () => {
      setFetching(true);
      const [pendingRes, auditRes] = await Promise.all([
        supabase
          .from("pending_people")
          .select("id, nome, email, slack_user_id, status, source, created_at, reviewed_at, director_notes")
          .eq("status", "MERGED")
          .order("reviewed_at", { ascending: false }),
        supabase
          .from("audit_logs")
          .select("id, entidade_id, payload, created_at")
          .eq("entidade", "people")
          .eq("acao", "SLACK_ID_BACKFILL")
          .order("created_at", { ascending: false }),
      ]);

      if (pendingRes.error) console.error("[AdminMergedPeople] pending error:", pendingRes.error);
      if (auditRes.error) console.error("[AdminMergedPeople] audit error:", auditRes.error);

      const pending = pendingRes.data || [];
      const audits = auditRes.data || [];

      const pendingPersonIds = pending
        .map((r: any) => /auto-merge into (\S+)/.exec(r.director_notes || "")?.[1])
        .filter(Boolean) as string[];
      const auditPersonIds = audits.map((a: any) => a.entidade_id).filter(Boolean);
      const allIds = Array.from(new Set([...pendingPersonIds, ...auditPersonIds]));

      const nameMap = new Map<string, { nome: string; email: string | null; email_pessoal: string | null; slack_user_id: string | null }>();
      if (allIds.length) {
        const { data } = await supabase
          .from("people")
          .select("id, nome, email, email_pessoal, slack_user_id")
          .in("id", allIds);
        (data || []).forEach((p: any) => nameMap.set(p.id, p));
      }

      const pendingRows: Row[] = pending.map((r: any) => {
        const pid = /auto-merge into (\S+)/.exec(r.director_notes || "")?.[1] ?? null;
        return {
          key: `p_${r.id}`,
          kind: "pending_merge",
          nome: r.nome,
          email: r.email,
          slack_user_id: r.slack_user_id,
          person_id: pid,
          person_nome: pid ? nameMap.get(pid)?.nome ?? null : null,
          when: r.reviewed_at ?? r.created_at,
          source: r.source,
          extra: r.director_notes,
        };
      });

      const auditRows: Row[] = audits.map((a: any) => {
        const p = nameMap.get(a.entidade_id);
        const payload = a.payload || {};
        return {
          key: `a_${a.id}`,
          kind: "slack_link",
          nome: p?.nome ?? null,
          email: payload.matched_email ?? p?.email ?? null,
          slack_user_id: payload.slack_user_id ?? p?.slack_user_id ?? null,
          person_id: a.entidade_id,
          person_nome: p?.nome ?? null,
          when: a.created_at,
          source: payload.source ?? null,
          extra: Array.isArray(payload.emails_tried) ? `emails: ${payload.emails_tried.join(", ")}` : null,
        };
      });

      const combined = [...pendingRows, ...auditRows].sort((a, b) =>
        (b.when || "").localeCompare(a.when || ""),
      );
      setRows(combined);
      setFetching(false);
    };
    if (isDirector) load();
  }, [isDirector]);

  const filtered = useMemo(() => {
    const em = emailFilter.trim().toLowerCase();
    const sl = slackFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (em && !(r.email || "").toLowerCase().includes(em)) return false;
      if (sl && !(r.slack_user_id || "").toLowerCase().includes(sl)) return false;
      return true;
    });
  }, [rows, emailFilter, slackFilter, kindFilter]);

  if (loading) return <div className="p-8"><Skeleton className="h-8 w-64" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isDirector) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2">
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao admin</Link>
            </Button>
            <h1 className="text-2xl font-bold">Cadastros consolidados</h1>
            <p className="text-sm text-muted-foreground">
              Pendentes do Slack mesclados em pessoas existentes + vínculos Slack↔pessoa criados por email.
            </p>
          </div>
          <Badge variant="secondary">{filtered.length} de {rows.length}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por email..."
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por Slack User ID (ex: U01...)..."
                value={slackFilter}
                onChange={(e) => setSlackFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {(["all","pending_merge","slack_link"] as const).map((k) => (
                <Button
                  key={k}
                  variant={kindFilter === k ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKindFilter(k)}
                >
                  {k === "all" ? "Todos" : k === "pending_merge" ? "Cadastro pendente" : "Vínculo Slack"}
                </Button>
              ))}
            </div>
            {(emailFilter || slackFilter || kindFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => { setEmailFilter(""); setSlackFilter(""); setKindFilter("all"); }}
              >
                <X className="h-4 w-4 mr-2" /> Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {fetching ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhum cadastro consolidado encontrado.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Slack ID</TableHead>
                    <TableHead>Pessoa vinculada</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>
                        <Badge variant={r.kind === "pending_merge" ? "default" : "secondary"} className="text-xs">
                          {r.kind === "pending_merge" ? "Cadastro pendente" : "Vínculo Slack"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{r.nome || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.email || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.slack_user_id || "—"}</TableCell>
                      <TableCell>
                        {r.person_id ? (
                          <div className="flex flex-col">
                            <span>{r.person_nome || "—"}</span>
                            <span className="text-xs text-muted-foreground font-mono">{r.person_id}</span>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.when ? formatDateSafe(r.when.slice(0, 10), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{r.source || "—"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
