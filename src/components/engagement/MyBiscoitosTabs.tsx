import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActivePeople } from "@/hooks/useEngagement";
import { BiscoitoList, BiscoitoRow, BISCOITO_CATEGORY, useBiscoitos } from "./BiscoitoList";

type Period = "month" | "quarter" | "year" | "all";

function periodStart(p: Period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "month") d.setDate(1);
  else if (p === "quarter") { d.setDate(1); d.setMonth(Math.floor(d.getMonth() / 3) * 3); }
  else if (p === "year") { d.setDate(1); d.setMonth(0); }
  else return undefined;
  return d.toISOString();
}

export function MyBiscoitosTabs({ personId, mural }: { personId?: string; mural: React.ReactNode }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState<Period>("year");
  const start = periodStart(period);
  const ids = personId ? [personId] : [];
  const received = useBiscoitos({ personIds: ids, direction: "received", start });
  const given = useBiscoitos({ personIds: ids, direction: "given", start });
  const { data: people = [] } = useActivePeople();
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.nome])), [people]);

  const filter = (rows: BiscoitoRow[], other: "from" | "to") =>
    rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (!search.trim()) return true;
      const id = other === "from" ? r.from_person_id : r.to_person_id;
      const nm = (id && names.get(id)) || (other === "from" ? r.from_slack_name : r.to_slack_name) || "";
      return nm.toLowerCase().includes(search.trim().toLowerCase());
    });

  const filters = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      <Input placeholder="Buscar colega..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {Object.entries(BISCOITO_CATEGORY).map(([k, m]) => (
            <SelectItem key={k} value={k}>{m.emoji} {m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Este mês</SelectItem>
          <SelectItem value="quarter">Este trimestre</SelectItem>
          <SelectItem value="year">Este ano</SelectItem>
          <SelectItem value="all">Todo o histórico</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const rec = filter(received.data ?? [], "from");
  const giv = filter(given.data ?? [], "to");

  return (
    <Tabs defaultValue="received">
      <TabsList className="mb-3 flex-wrap h-auto">
        <TabsTrigger value="received">Recebidos ({rec.length})</TabsTrigger>
        <TabsTrigger value="given">Enviados ({giv.length})</TabsTrigger>
        <TabsTrigger value="mural">Mural da empresa</TabsTrigger>
      </TabsList>
      <TabsContent value="received" className="mt-0">
        {filters}
        <ScrollArea className="h-[420px] pr-3">
          <BiscoitoList rows={rec} isLoading={received.isLoading} empty="Você ainda não recebeu biscoitos neste período." />
        </ScrollArea>
      </TabsContent>
      <TabsContent value="given" className="mt-0">
        {filters}
        <ScrollArea className="h-[420px] pr-3">
          <BiscoitoList rows={giv} isLoading={given.isLoading} empty="Você ainda não enviou biscoitos neste período." />
        </ScrollArea>
      </TabsContent>
      <TabsContent value="mural" className="mt-0">{mural}</TabsContent>
    </Tabs>
  );
}
