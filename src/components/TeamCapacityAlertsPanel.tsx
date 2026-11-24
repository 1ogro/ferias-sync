import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeams } from "@/hooks/useTeams";
import { formatDateSafe, formatDateToYYYYMMDD } from "@/lib/dateUtils";
import { computeCapacityWindows, CapacityAbsence } from "@/lib/teamCapacity";

const APPROVED = ["APROVADO_FINAL", "REALIZADO", "EM_ANDAMENTO"];
const PENDING = ["PENDENTE", "EM_ANALISE_GESTOR", "APROVADO_1NIVEL", "EM_ANALISE_DIRETOR"];
const TIPO_LABEL: Record<string, string> = {
  FERIAS: "Férias", DAYOFF: "Day-off", LICENCA_MEDICA: "Licença médica", LICENCA_MATERNIDADE: "Licença maternidade",
};

export function TeamCapacityAlertsPanel() {
  const { user } = useAuth();
  const { data: teams = [] } = useTeams();
  const [horizon, setHorizon] = useState("60");
  const [teamFilter, setTeamFilter] = useState("all");
  const [people, setPeople] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [absences, setAbsences] = useState<(CapacityAbsence & { sub_time: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const from = formatDateToYYYYMMDD(new Date());
  const to = formatDateToYYYYMMDD(new Date(Date.now() + Number(horizon) * 86400000));

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [prof, ppl, reqs, mls] = await Promise.all([
        supabase.from("profiles").select("people!inner(*)").eq("user_id", user.id).maybeSingle(),
        supabase.from("people").select("id, nome, sub_time, gestor_id, papel").eq("ativo", true),
        supabase.from("requests").select("id, requester_id, tipo, inicio, fim, status")
          .in("tipo", Object.keys(TIPO_LABEL)).in("status", [...APPROVED, ...PENDING])
          .gte("fim", from).lte("inicio", to),
        supabase.from("medical_leaves").select("id, person_id, start_date, end_date").eq("status", "ATIVA")
          .gte("end_date", from).lte("start_date", to),
      ]);
      const plist = ppl.data || [];
      const byId = new Map(plist.map((p: any) => [p.id, p]));
      const list: (CapacityAbsence & { sub_time: string })[] = [];
      for (const r of reqs.data || []) {
        const p: any = byId.get(r.requester_id);
        if (!p?.sub_time || !r.inicio || !r.fim) continue;
        list.push({ personId: p.id, nome: p.nome, sub_time: p.sub_time, tipo: r.tipo, inicio: r.inicio, fim: r.fim, pending: PENDING.includes(r.status) });
      }
      for (const m of mls.data || []) {
        const p: any = byId.get(m.person_id);
        if (!p?.sub_time) continue;
        if (list.some((a) => a.personId === p.id && a.tipo === "LICENCA_MEDICA" && a.inicio === m.start_date)) continue;
        list.push({ personId: p.id, nome: p.nome, sub_time: p.sub_time, tipo: "LICENCA_MEDICA", inicio: m.start_date, fim: m.end_date, pending: false });
      }
      setMe((prof.data as any)?.people ?? null);
      setPeople(plist);
      setAbsences(list);
      setLoading(false);
    })();
  }, [user, from, to]);

  const isCorporate = !!me && (me.is_admin || me.papel === "DIRETOR");
  const visibleTeams = useMemo(() => {
    const names = new Set<string>();
    if (isCorporate) teams.forEach((t) => names.add(t.nome));
    else if (me) {
      if (me.sub_time) names.add(me.sub_time);
      people.filter((p) => p.gestor_id === me.id && p.sub_time).forEach((p) => names.add(p.sub_time));
    }
    return teams.filter((t) => names.has(t.nome));
  }, [teams, people, me, isCorporate]);

  const rows = useMemo(() => visibleTeams
    .filter((t) => teamFilter === "all" || t.nome === teamFilter)
    .map((t) => {
      const headcount = people.filter((p) => p.sub_time === t.nome).length;
      const abs = absences.filter((a) => a.sub_time === t.nome);
      const windows = computeCapacityWindows(abs, headcount, from, to, t.overlap_alert_threshold ?? 2, t.min_capacity_pct ?? 70);
      const absentToday = new Set(abs.filter((a) => a.inicio <= from && a.fim >= from).map((a) => a.personId)).size;
      return { team: t, headcount, windows, absentToday };
    })
    .sort((a, b) => b.windows.length - a.windows.length), [visibleTeams, teamFilter, people, absences, from, to]);

  const totalAlerts = rows.reduce((s, r) => s + r.windows.length, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" /> Alertas de capacidade por time
            </CardTitle>
            <CardDescription>
              Férias, day-offs e licenças aprovadas e pendentes. Limites definidos em Administração → Times.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {visibleTeams.length > 1 && (
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os times</SelectItem>
                  {visibleTeams.map((t) => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Próx. 30 dias</SelectItem>
                <SelectItem value="60">Próx. 60 dias</SelectItem>
                <SelectItem value="90">Próx. 90 dias</SelectItem>
                <SelectItem value="180">Próx. 180 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <>
            <p className="text-sm text-muted-foreground">{totalAlerts} alerta(s) em {rows.length} time(s).</p>
            {rows.map(({ team, headcount, windows, absentToday }) => {
              const capToday = headcount ? Math.round(((headcount - absentToday) / headcount) * 100) : 100;
              return (
                <div key={team.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{team.nome}</span>
                    <Badge variant="outline"><Users className="h-3 w-3 mr-1" />{headcount} no quadro</Badge>
                    <Badge variant={capToday < (team.min_capacity_pct ?? 70) ? "destructive" : "secondary"}>Hoje: {capToday}% disponível</Badge>
                    <span className="text-xs text-muted-foreground">Alerta: {team.overlap_alert_threshold ?? 2}+ ausentes ou abaixo de {team.min_capacity_pct ?? 70}%</span>
                  </div>
                  {windows.length === 0 ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Sem conflitos no período.</p>
                  ) : windows.map((w) => (
                    <div key={w.start} className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {formatDateSafe(w.start, "dd/MM")} – {formatDateSafe(w.end, "dd/MM/yyyy")}
                        {w.overlap && <Badge variant="destructive">{w.peak} ausentes ao mesmo tempo</Badge>}
                        {w.lowCapacity && <Badge variant="destructive">Quadro em {w.minCapacityPct}%</Badge>}
                        {w.hasPending && <Badge variant="outline">Inclui pendentes</Badge>}
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {w.people.map((p, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                            <span>{p.nome}</span>
                            <Badge variant="secondary" className="text-[10px]">{TIPO_LABEL[p.tipo] ?? p.tipo}</Badge>
                            <span className="text-muted-foreground">{formatDateSafe(p.inicio, "dd/MM")} – {formatDateSafe(p.fim, "dd/MM")}</span>
                            <Badge variant={p.pending ? "outline" : "default"} className="text-[10px]">{p.pending ? "Pendente" : "Aprovado"}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
