import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Trophy, Heart, Send, Settings as SettingsIcon, Check, ChevronsUpDown, X, MessageSquareOff, CheckCircle2 } from "lucide-react";
import { useKudosFeed, useLeaderboard, useMyPoints, useSendKudo, useActivePeople, useEngagementPrefs, useSaveEngagementPrefs, KudosCategory } from "@/hooks/useEngagement";
import { useToast } from "@/hooks/use-toast";
import { Papel } from "@/lib/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const CATEGORY_META: Record<KudosCategory, { label: string; emoji: string; className: string }> = {
  teamwork:   { label: "Trabalho em equipe", emoji: "🤝", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  innovation: { label: "Inovação",            emoji: "💡", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  delivery:   { label: "Entrega",             emoji: "🚀", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  leadership: { label: "Liderança",           emoji: "🏆", className: "bg-purple-500/10 text-purple-700 dark:text-purple-300" },
  customer:   { label: "Foco no cliente",     emoji: "❤️", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

const REASON_LABEL: Record<string, string> = {
  pulse_response: "Pulse respondido",
  kudo_received: "Kudo recebido",
  kudo_given: "Kudo enviado",
  streak: "Sequência semanal",
  peer_review: "Peer review",
};

function MyPointsCard({ personId }: { personId?: string }) {
  const { data } = useMyPoints(personId);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Meus pontos do mês</CardTitle>
          <span className="text-3xl font-bold text-primary">{data?.total ?? 0}</span>
        </div>
        <CardDescription>Histórico recente</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 pr-3">
          {data?.points.length ? (
            <ul className="space-y-2 text-sm">
              {data.points.slice(0, 20).map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{REASON_LABEL[p.reason] ?? p.reason}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                    <span className={`font-semibold ${p.points >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{p.points > 0 ? "+" : ""}{p.points}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sem pontos registrados neste mês ainda.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LeaderboardCard({
  period = "month",
  title = "Ranking do mês",
  description = "Quem mais engajou neste período",
}: {
  period?: "month" | "quarter" | "year" | "all";
  title?: string;
  description?: string;
}) {
  const [scope, setScope] = useState<"team" | "global">("team");
  const { data: rows = [] } = useLeaderboard(scope, period);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> {title}</CardTitle>
          <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
            <TabsList>
              <TabsTrigger value="team">Meu time</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 pr-3">
          {rows.length ? (
            <ol className="space-y-2">
              {rows.map((r, i) => (
                <li key={r.person_id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-semibold text-muted-foreground">{i + 1}</span>
                    <span className="font-medium">{r.nome}</span>
                    {r.sub_time && <Badge variant="outline" className="text-xs">{r.sub_time}</Badge>}
                  </div>
                  <span className="font-bold text-primary">{r.total_points} pts</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma pontuação no recorte selecionado.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

const MAX_MULTI_RECIPIENTS = 10;

function GiveKudosDialog({ personId, fromName, papel }: { personId?: string; fromName?: string; papel?: Papel }) {
  const [open, setOpen] = useState(false);
  const [toIds, setToIds] = useState<string[]>([]);
  const [category, setCategory] = useState<KudosCategory>("teamwork");
  const [message, setMessage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [share, setShare] = useState(false);
  const SHARE_CHANNEL = "#time";
  const { data: people = [] } = useActivePeople();
  const { mutateAsync, isPending } = useSendKudo();
  const { toast } = useToast();

  const peopleOptions = useMemo(() => people.filter((p) => p.id !== personId), [people, personId]);
  const canMulti = (papel === Papel.GESTOR || papel === Papel.DIRETOR) && category === "delivery";

  // Ao trocar categoria/permissão, mantém apenas o 1º destinatário
  const handleCategoryChange = (v: KudosCategory) => {
    setCategory(v);
    const newCanMulti = (papel === Papel.GESTOR || papel === Papel.DIRETOR) && v === "delivery";
    if (!newCanMulti && toIds.length > 1) setToIds(toIds.slice(0, 1));
  };

  const toggleId = (id: string) => {
    setToIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (!canMulti) return [id];
      if (prev.length >= MAX_MULTI_RECIPIENTS) {
        toast({ title: `Máximo de ${MAX_MULTI_RECIPIENTS} colegas por envio`, variant: "destructive" });
        return prev;
      }
      return [...prev, id];
    });
  };

  const submit = async () => {
    if (toIds.length === 0 || !message.trim()) {
      toast({ title: "Preencha destinatário(s) e mensagem", variant: "destructive" });
      return;
    }
    if (toIds.length > MAX_MULTI_RECIPIENTS) {
      toast({ title: `Máximo de ${MAX_MULTI_RECIPIENTS} colegas por envio`, variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        message: message.trim(),
        category,
        post_to_channel: share ? SHARE_CHANNEL : null,
      };
      if (toIds.length === 1) payload.to_person_id = toIds[0];
      else payload.to_person_ids = toIds;

      const res: any = await mutateAsync(payload);
      const count = typeof res?.count === "number" ? res.count : toIds.length;
      const dedupedCount = typeof res?.deduped_count === "number" ? res.deduped_count : 0;
      if (count === 0 && dedupedCount > 0) {
        toast({
          title: "Este kudos já foi enviado há instantes 👍",
          description: "Evitamos duplicar o reconhecimento — o anterior já foi registrado.",
        });
      } else {
        toast({
          title: count === 1 ? "Kudos enviado! 🎉" : `Kudos enviados para ${count} colegas 🎉`,
          description: fromName ? `De ${fromName}` : undefined,
        });
      }
      setOpen(false);
      setToIds([]); setMessage(""); setShare(false); setCategory("teamwork");
    } catch (e: any) {
      toast({ title: "Falha ao enviar kudos", description: e.message, variant: "destructive" });
    }
  };


  const selectedNames = useMemo(
    () => peopleOptions.filter((p) => toIds.includes(p.id)),
    [peopleOptions, toIds]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Heart className="h-4 w-4" /> Dar um kudos</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconhecer um colega</DialogTitle>
          <DialogDescription>Diga algo positivo. Dá pontos pra quem recebe e também pra você.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => handleCategoryChange(v as KudosCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.emoji} {m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(papel === Papel.GESTOR || papel === Papel.DIRETOR) && (
              <p className="text-xs text-muted-foreground mt-1">
                Na categoria <span className="font-medium">Entrega</span> você pode reconhecer até {MAX_MULTI_RECIPIENTS} colegas de uma vez.
              </p>
            )}
          </div>

          <div>
            <Label>{canMulti ? `Para quem (${toIds.length}/${MAX_MULTI_RECIPIENTS})` : "Para quem"}</Label>
            {canMulti ? (
              <>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className="truncate text-left">
                        {toIds.length === 0 ? "Escolha os colegas" : `${toIds.length} selecionado(s)`}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar colega..." />
                      <CommandList>
                        <CommandEmpty>Ninguém encontrado.</CommandEmpty>
                        <CommandGroup>
                          {peopleOptions.map((p) => {
                            const checked = toIds.includes(p.id);
                            return (
                              <CommandItem key={p.id} value={p.nome} onSelect={() => toggleId(p.id)}>
                                <Check className={`mr-2 h-4 w-4 ${checked ? "opacity-100" : "opacity-0"}`} />
                                {p.nome}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedNames.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedNames.map((p) => (
                      <Badge key={p.id} variant="secondary" className="gap-1">
                        {p.nome}
                        <button type="button" onClick={() => toggleId(p.id)} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Select value={toIds[0] || ""} onValueChange={(v) => setToIds(v ? [v] : [])}>
                <SelectTrigger><SelectValue placeholder="Escolha um colega" /></SelectTrigger>
                <SelectContent>
                  {peopleOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label>Mensagem</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Conta o que rolou de bom..." rows={4} />
            <p className="text-xs text-muted-foreground mt-1">{message.length}/500</p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="kudo-share" checked={share} onCheckedChange={(v) => setShare(v === true)} />
            <div className="grid gap-1 leading-none">
              <Label htmlFor="kudo-share" className="cursor-pointer">Postar em {SHARE_CHANNEL}</Label>
              <p className="text-xs text-muted-foreground">Compartilha o kudos no canal do Slack. Se desmarcado, fica só no app.</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={isPending || toIds.length === 0} className="gap-2">
            <Send className="h-4 w-4" /> Enviar{toIds.length > 1 ? ` (${toIds.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KudosFeed() {
  const { data: kudos = [] } = useKudosFeed(50);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Heart className="h-4 w-4 text-rose-500" /> Feed de kudos</CardTitle>
        <CardDescription>Atualiza em tempo real</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[480px] pr-3">
          {kudos.length ? (
            <ul className="space-y-3">
              {kudos.map((k) => {
                const meta = CATEGORY_META[k.category];
                return (
                  <li key={k.id} className="border rounded-lg p-3 min-w-0 max-w-full overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 text-sm flex-wrap">
                        <span className="font-semibold">{k.from?.nome ?? k.from_slack_name ?? "Alguém"}</span>
                        {k.pending_from && <Badge variant="outline" className="text-[10px]">slack only</Badge>}
                        <span className="text-muted-foreground">→</span>
                        <span className="font-semibold">{k.to?.nome ?? k.to_slack_name ?? "?"}</span>
                        {k.pending_to && <Badge variant="outline" className="text-[10px]">slack only</Badge>}
                      </div>
                      <Badge className={meta.className} variant="secondary">{meta.emoji} {meta.label}</Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 max-w-full">{k.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(k.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ainda não há kudos. Seja o primeiro!</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function PrefsCard({ personId }: { personId?: string }) {
  const { data } = useEngagementPrefs(personId);
  const { mutateAsync, isPending } = useSaveEngagementPrefs();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(null);
  const { toast } = useToast();

  const openDlg = () => { setForm(data); setOpen(true); };
  const trunc = (t?: string) => (t ? t.slice(0, 5) : "");

  const save = async () => {
    if (!personId || !form) return;
    try {
      await mutateAsync({ person_id: personId, ...form });
      toast({ title: "Preferências salvas" });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Lembretes inteligentes</CardTitle>
            <Button size="sm" variant="outline" onClick={openDlg}>Configurar</Button>
          </div>
          <CardDescription>Quando o bot pode te incomodar</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="text-muted-foreground">Não perturbe:</span> {trunc(data?.quiet_hours_start)} – {trunc(data?.quiet_hours_end)}</p>
          <p><span className="text-muted-foreground">Janela preferida:</span> {trunc(data?.preferred_window_start)} – {trunc(data?.preferred_window_end)}</p>
          <p><span className="text-muted-foreground">Fuso:</span> {data?.timezone}</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Preferências de lembretes</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Não perturbe (início)</Label><Input type="time" value={trunc(form.quiet_hours_start)} onChange={(e) => setForm({ ...form, quiet_hours_start: e.target.value })} /></div>
                <div><Label>Não perturbe (fim)</Label><Input type="time" value={trunc(form.quiet_hours_end)} onChange={(e) => setForm({ ...form, quiet_hours_end: e.target.value })} /></div>
                <div><Label>Janela preferida (início)</Label><Input type="time" value={trunc(form.preferred_window_start)} onChange={(e) => setForm({ ...form, preferred_window_start: e.target.value })} /></div>
                <div><Label>Janela preferida (fim)</Label><Input type="time" value={trunc(form.preferred_window_end)} onChange={(e) => setForm({ ...form, preferred_window_end: e.target.value })} /></div>
              </div>
              <div>
                <Label>Fuso horário</Label>
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/Sao_Paulo" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Engagement() {
  const { person } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> Engajamento do Time</h1>
            <p className="text-muted-foreground">Reconheça colegas, ganhe pontos e acompanhe a vibe do time.</p>
          </div>
          <GiveKudosDialog personId={person?.id} fromName={person?.nome} papel={person?.papel} />
        </div>

        {(person?.papel === 'GESTOR' || person?.papel === 'DIRETOR' || person?.is_admin) && (
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <SettingsIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Pulses de Performance</h3>
                  <p className="text-sm text-muted-foreground">Crie, edite e dispare enquetes de engajamento do time.</p>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link to="/vacation-management?tab=pulses" aria-label="Ir para gerenciamento de pulses">Gerenciar pulses</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6 lg:col-span-1">
            <MyPointsCard personId={person?.id} />
            <PrefsCard personId={person?.id} />
          </div>
          <div className="space-y-6 lg:col-span-1">
            <LeaderboardCard />
            {person?.papel === "DIRETOR" && (
              <>
                <LeaderboardCard
                  period="quarter"
                  title="Ranking do trimestre"
                  description="Acumulado no trimestre corrente"
                />
                <LeaderboardCard
                  period="year"
                  title="Ranking do ano"
                  description="Acumulado no ano corrente"
                />
              </>
            )}
          </div>
          <div className="space-y-6 lg:col-span-1">
            <KudosFeed />
          </div>
        </div>
      </div>
    </div>
  );
}
