import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Person = { person_id: string; nome: string; sub_time: string; papel: string; kudos_received: number; kudos_given: number; peer_feedbacks: number; external_feedbacks: number; points: number };
type Team = { sub_time: string; people_count: number; kudos_received: number; kudos_given: number; peer_feedbacks: number; external_feedbacks: number; points: number };
type Well = { person_id: string; nome: string; sub_time: string; survey: string; question: string; dispatched_at: string; submitted_at: string; scale_value: number | null; text_value: string | null };
type Report = { link: { recipient_name: string; scope: string; expires_at: string; manager_name: string | null }; month: string; people: Person[]; teams: Team[]; wellbeing: Well[] };

const fmt = (d: string) => new Date(d).toLocaleDateString("pt-BR");
const monthOptions = () => {
  const out: { v: string; l: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    out.push({ v, l: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) });
  }
  return out;
};

export default function LeadershipReport() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0].v);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");

  useEffect(() => {
    document.title = "Relatório de liderança · Engajamento e Bem-estar";
    setLoading(true);
    supabase.rpc("get_leadership_report" as any, { p_token: token, p_month: month }).then(({ data, error }) => {
      if (error) setError(error.message.includes("expirado") ? "Este link expirou. Peça um novo ao RH." : "Link inválido.");
      else setData(data as unknown as Report);
      setLoading(false);
    });
  }, [token, month]);

  const teams = useMemo(() => [...new Set((data?.people ?? []).map((p) => p.sub_time))].sort(), [data]);
  const match = (p: { nome: string; sub_time: string }) =>
    (team === "all" || p.sub_time === team) && p.nome.toLowerCase().includes(q.toLowerCase());

  const wellByPerson = useMemo(() => {
    const m = new Map<string, { nome: string; sub_time: string; rows: Well[] }>();
    for (const w of data?.wellbeing ?? []) {
      if (!match(w)) continue;
      const e = m.get(w.person_id) ?? { nome: w.nome, sub_time: w.sub_time, rows: [] };
      e.rows.push(w);
      m.set(w.person_id, e);
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, team]);

  const teamAvg = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const w of data?.wellbeing ?? []) if (w.scale_value != null) m.set(w.sub_time, [...(m.get(w.sub_time) ?? []), w.scale_value]);
    return new Map([...m].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  }, [data]);

  if (error) return <Center><h1 className="text-xl font-semibold">{error}</h1></Center>;
  if (loading && !data) return <Center><Skeleton className="h-40 w-full max-w-3xl" /></Center>;
  if (!data) return null;

  const isGlobal = data.link.scope === "global";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">Olá, {data.link.recipient_name}</p>
          <h1 className="text-2xl font-bold">
            {isGlobal ? "Relatório de liderança · Empresa" : `Relatório do time de ${data.link.manager_name ?? "gestão"}`}
          </h1>
          <p className="text-sm text-muted-foreground">Link pessoal, válido até {fmt(data.link.expires_at)}.</p>
        </header>

        <div className="flex flex-wrap gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Time" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os times</SelectItem>
              {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar pessoa" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        </div>

        <Tabs defaultValue="engagement">
          <TabsList>
            <TabsTrigger value="engagement">Engajamento do mês</TabsTrigger>
            <TabsTrigger value="wellbeing">Bem-estar</TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Por time</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table head={["Time", "Pessoas", "🍪 Recebidos", "🍪 Dados", "Feedbacks pares", "Feedbacks externos", "Pontos"]}>
                  {data.teams.filter((t) => team === "all" || t.sub_time === team).map((t) => (
                    <tr key={t.sub_time} className="border-t">
                      <td className="py-2 font-medium">{t.sub_time}</td>
                      <td>{t.people_count}</td><td>{t.kudos_received}</td><td>{t.kudos_given}</td>
                      <td>{t.peer_feedbacks}</td><td>{t.external_feedbacks}</td><td className="font-semibold">{t.points}</td>
                    </tr>
                  ))}
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Por pessoa</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table head={["Pessoa", "Time", "🍪 Recebidos", "🍪 Dados", "Feedbacks pares", "Feedbacks externos", "Pontos"]}>
                  {data.people.filter(match).map((p) => (
                    <tr key={p.person_id} className="border-t">
                      <td className="py-2 font-medium">{p.nome}</td><td>{p.sub_time}</td>
                      <td>{p.kudos_received}</td><td>{p.kudos_given}</td><td>{p.peer_feedbacks}</td>
                      <td>{p.external_feedbacks}</td><td className="font-semibold">{p.points}</td>
                    </tr>
                  ))}
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wellbeing" className="space-y-4">
            <p className="text-sm text-muted-foreground">Todos os check-ins dos últimos 6 meses, por pessoa. Pesquisas anônimas não aparecem.</p>
            {wellByPerson.length === 0 && <p className="text-sm">Nenhuma resposta encontrada.</p>}
            {wellByPerson.map((p) => {
              const vals = p.rows.filter((r) => r.scale_value != null).map((r) => r.scale_value!);
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              const tAvg = teamAvg.get(p.sub_time);
              return (
                <Card key={p.nome}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex flex-wrap items-center gap-2">
                      {p.nome} <Badge variant="outline">{p.sub_time}</Badge>
                      {avg != null && <Badge>Média {avg.toFixed(1)}</Badge>}
                      {tAvg != null && <Badge variant="secondary">Time {tAvg.toFixed(1)}</Badge>}
                    </CardTitle>
                    <CardDescription>{p.rows.length} resposta(s)</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table head={["Ciclo", "Respondido", "Pesquisa", "Pergunta", "Nota", "Depoimento"]}>
                      {p.rows.map((r, i) => (
                        <tr key={i} className="border-t align-top">
                          <td className="py-2 whitespace-nowrap">{fmt(r.dispatched_at)}</td>
                          <td className="whitespace-nowrap">{fmt(r.submitted_at)}</td>
                          <td>{r.survey}</td><td>{r.question}</td>
                          <td className="font-semibold">{r.scale_value ?? "—"}</td>
                          <td className="max-w-sm">{r.text_value ?? ""}</td>
                        </tr>
                      ))}
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6 text-center">{children}</div>;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground">{head.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
      <tbody className="[&_td]:pr-4">{children}</tbody>
    </table>
  );
}
