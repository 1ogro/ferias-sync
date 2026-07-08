import { useMemo, useState } from "react";
import { ExternalLink, ChevronDown, Bell, Mail, Hash, MessageCircle, Clock, Zap, Hand } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  NOTIFICATIONS_CATALOG,
  CHANNEL_LABEL,
  CATEGORY_LABEL,
  ALL_PUBLICS,
  type NotificationCategory,
  type NotificationChannel,
} from "@/lib/notificationsCatalog";
import { humanizeCron } from "@/lib/cronHumanize";

const SUPABASE_PROJECT_ID = "uhphxyhffpbnmsrlggbe";

const CHANNEL_ICON: Record<NotificationChannel, typeof Mail> = {
  slack_dm: MessageCircle,
  slack_canal: Hash,
  email: Mail,
};

const CHANNEL_STYLE: Record<NotificationChannel, string> = {
  slack_dm: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  slack_canal: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  email: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
};

const TRIGGER_ICON = { cron: Clock, evento: Zap, manual: Hand };

const ALL_CATEGORIES = Object.keys(CATEGORY_LABEL) as NotificationCategory[];
const ALL_CHANNELS = Object.keys(CHANNEL_LABEL) as NotificationChannel[];

export default function NotificationsCatalogTable() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [channel, setChannel] = useState<string>("all");
  const [publico, setPublico] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return NOTIFICATIONS_CATALOG.filter((n) => {
      if (category !== "all" && n.categoria !== category) return false;
      if (channel !== "all" && !n.canais.includes(channel as NotificationChannel)) return false;
      if (publico !== "all" && !n.publico.includes(publico)) return false;
      if (!q) return true;
      return (
        n.nome.toLowerCase().includes(q) ||
        n.descricao.toLowerCase().includes(q) ||
        n.edgeFunction.toLowerCase().includes(q) ||
        n.publico.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [search, category, channel, publico]);

  const stats = useMemo(() => {
    const total = NOTIFICATIONS_CATALOG.length;
    const bySlack = NOTIFICATIONS_CATALOG.filter((n) =>
      n.canais.some((c) => c.startsWith("slack")),
    ).length;
    const byEmail = NOTIFICATIONS_CATALOG.filter((n) => n.canais.includes("email")).length;
    const cronCount = NOTIFICATIONS_CATALOG.filter((n) => n.gatilho.tipo === "cron").length;
    return { total, bySlack, byEmail, cronCount };
  }, []);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Bell} label="Notificações" value={stats.total} />
        <StatCard icon={MessageCircle} label="Via Slack" value={stats.bySlack} />
        <StatCard icon={Mail} label="Via E-mail" value={stats.byEmail} />
        <StatCard icon={Clock} label="Agendadas (cron)" value={stats.cronCount} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <Input
            placeholder="Buscar por nome, descrição, função ou público…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:flex-1"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {ALL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              {ALL_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={publico} onValueChange={setPublico}>
            <SelectTrigger className="md:w-52"><SelectValue placeholder="Público" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os públicos</SelectItem>
              {ALL_PUBLICS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Notificação</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Gatilho</TableHead>
                  <TableHead>Público-alvo</TableHead>
                  <TableHead>Canais</TableHead>
                  <TableHead>Logs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((n) => {
                  const isOpen = !!expanded[n.id];
                  const TriggerIcon = TRIGGER_ICON[n.gatilho.tipo];
                  return (
                    <>
                      <TableRow key={n.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded((s) => ({ ...s, [n.id]: !s[n.id] }))}>
                        <TableCell className="pr-0">
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {n.nome}
                            {!n.ativo && (
                              <Badge variant="outline" className="text-xs">inativa</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{CATEGORY_LABEL[n.categoria]}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2 text-sm">
                            <TriggerIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <span>{n.gatilho.cronExpr ? humanizeCron(n.gatilho.cronExpr) : n.gatilho.detalhe}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{n.publico.join(", ")}</TableCell>
                        <TableCell>
                          <ChannelsBadges canais={n.canais} />
                        </TableCell>
                        <TableCell>
                          <a
                            href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/functions/${n.edgeFunction}/logs`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-sm inline-flex items-center gap-1 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            abrir
                          </a>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${n.id}-details`} className="bg-muted/20">
                          <TableCell></TableCell>
                          <TableCell colSpan={6}>
                            <ExpandedDetails entry={n} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma notificação encontrada com esses filtros.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {filtered.map((n) => {
              const isOpen = !!expanded[n.id];
              const TriggerIcon = TRIGGER_ICON[n.gatilho.tipo];
              return (
                <div key={n.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{n.nome}</div>
                    <Badge variant="secondary" className="shrink-0">{CATEGORY_LABEL[n.categoria]}</Badge>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <TriggerIcon className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{n.gatilho.cronExpr ? humanizeCron(n.gatilho.cronExpr) : n.gatilho.detalhe}</span>
                  </div>
                  <div className="text-sm"><span className="text-muted-foreground">Público: </span>{n.publico.join(", ")}</div>
                  <ChannelsBadges canais={n.canais} />
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((s) => ({ ...s, [n.id]: !s[n.id] }))}>
                    {isOpen ? "Ocultar detalhes" : "Ver detalhes"}
                    <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </Button>
                  {isOpen && <ExpandedDetails entry={n} />}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma notificação encontrada.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelsBadges({ canais }: { canais: NotificationChannel[] }) {
  if (canais.length === 0) {
    return <Badge variant="outline" className="text-xs">sem envio</Badge>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {canais.map((c) => {
        const Icon = CHANNEL_ICON[c];
        return (
          <Badge key={c} variant="outline" className={`text-xs ${CHANNEL_STYLE[c]}`}>
            <Icon className="h-3 w-3 mr-1" />
            {CHANNEL_LABEL[c]}
          </Badge>
        );
      })}
    </div>
  );
}

function ExpandedDetails({ entry }: { entry: (typeof NOTIFICATIONS_CATALOG)[number] }) {
  return (
    <div className="py-2 space-y-2 text-sm">
      <p>{entry.descricao}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Gatilho</div>
          <div>
            {entry.gatilho.tipo === "cron" ? "Cron" : entry.gatilho.tipo === "evento" ? "Evento no app" : "Ação manual"}
            {entry.gatilho.cronExpr && (
              <span className="text-muted-foreground"> — <code className="text-xs">{entry.gatilho.cronExpr}</code></span>
            )}
          </div>
          <div className="text-muted-foreground">{entry.gatilho.detalhe}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Edge function</div>
          <a
            href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/functions/${entry.edgeFunction}/logs`}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            <code className="text-xs">{entry.edgeFunction}</code>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Bell; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
