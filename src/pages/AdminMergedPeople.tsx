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

type MergedRow = {
  id: string;
  nome: string | null;
  email: string | null;
  slack_user_id: string | null;
  status: string;
  source: string | null;
  created_at: string;
  reviewed_at: string | null;
  director_notes: string | null;
  matched_person_id: string | null;
  matched_person_nome: string | null;
};

export default function AdminMergedPeople() {
  const { user, person, loading } = useAuth();
  const [rows, setRows] = useState<MergedRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [emailFilter, setEmailFilter] = useState("");
  const [slackFilter, setSlackFilter] = useState("");

  const isDirector = person?.papel === "DIRETOR" || person?.is_admin === true;

  useEffect(() => {
    const load = async () => {
      setFetching(true);
      const { data, error } = await supabase
        .from("pending_people")
        .select("id, nome, email, slack_user_id, status, source, created_at, reviewed_at, director_notes")
        .eq("status", "MERGED")
        .order("reviewed_at", { ascending: false });

      if (error) {
        console.error("[AdminMergedPeople] load error:", error);
        setRows([]);
        setFetching(false);
        return;
      }

      // Extrai person_id do director_notes ("auto-merge into pessoa_XXX")
      const parsed = (data || []).map((r: any) => {
        const match = /auto-merge into (\S+)/.exec(r.director_notes || "");
        return { ...r, matched_person_id: match?.[1] ?? null, matched_person_nome: null } as MergedRow;
      });

      const personIds = Array.from(new Set(parsed.map((r) => r.matched_person_id).filter(Boolean))) as string[];
      if (personIds.length) {
        const { data: people } = await supabase
          .from("people").select("id, nome").in("id", personIds);
        const nameMap = new Map((people || []).map((p: any) => [p.id, p.nome]));
        parsed.forEach((r) => {
          if (r.matched_person_id) r.matched_person_nome = nameMap.get(r.matched_person_id) ?? null;
        });
      }
      setRows(parsed);
      setFetching(false);
    };
    if (isDirector) load();
  }, [isDirector]);

  const filtered = useMemo(() => {
    const em = emailFilter.trim().toLowerCase();
    const sl = slackFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (em && !(r.email || "").toLowerCase().includes(em)) return false;
      if (sl && !(r.slack_user_id || "").toLowerCase().includes(sl)) return false;
      return true;
    });
  }, [rows, emailFilter, slackFilter]);

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
              Pendentes do Slack que foram automaticamente mesclados em pessoas já cadastradas.
            </p>
          </div>
          <Badge variant="secondary">{filtered.length} de {rows.length}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            {(emailFilter || slackFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => { setEmailFilter(""); setSlackFilter(""); }}
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
                    <TableHead>Nome (Slack)</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Slack ID</TableHead>
                    <TableHead>Mesclado em</TableHead>
                    <TableHead>Consolidado em</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.email || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.slack_user_id || "—"}</TableCell>
                      <TableCell>
                        {r.matched_person_id ? (
                          <div className="flex flex-col">
                            <span>{r.matched_person_nome || "—"}</span>
                            <span className="text-xs text-muted-foreground font-mono">{r.matched_person_id}</span>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.reviewed_at ? formatDateSafe(r.reviewed_at.slice(0, 10), "dd/MM/yyyy") : "—"}
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
