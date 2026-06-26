import { useMemo, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Trophy, Heart, Send, Settings as SettingsIcon } from "lucide-react";
import { useKudosFeed, useLeaderboard, useMyPoints, useSendKudo, useActivePeople, useEngagementPrefs, useSaveEngagementPrefs, KudosCategory } from "@/hooks/useEngagement";
import { useToast } from "@/hooks/use-toast";
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

function LeaderboardCard() {
  const [scope, setScope] = useState<"team" | "global">("team");
  const { data: rows = [] } = useLeaderboard(scope, "month");
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Ranking do mês</CardTitle>
          <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
            <TabsList>
              <TabsTrigger value="team">Meu time</TabsTrigger>
              <TabsTrigger value="global">Global</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <CardDescription>Quem mais engajou neste período</CardDescription>
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

function GiveKudosDialog({ personId, fromName }: { personId?: string; fromName?: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string>("");
  const [category, setCategory] = useState<KudosCategory>("teamwork");
  const [message, setMessage] = useState("");
  
  const [share, setShare] = useState(false);
  const SHARE_CHANNEL = "#time";
  const { data: people = [] } = useActivePeople();
  const { mutateAsync, isPending } = useSendKudo();
  const { toast } = useToast();

  const peopleOptions = useMemo(() => people.filter((p) => p.id !== personId), [people, personId]);

  const submit = async () => {
    if (!to || !message.trim()) {
      toast({ title: "Preencha destinatário e mensagem", variant: "destructive" });
      return;
    }
    try {
      await mutateAsync({
        to_person_id: to,
        message: message.trim(),
        category,
        post_to_channel: share ? SHARE_CHANNEL : null,
      });
      toast({ title: "Kudos enviado! 🎉", description: fromName ? `De ${fromName}` : undefined });
      setOpen(false);
      setTo(""); setMessage(""); setShare(false); setCategory("teamwork");
    } catch (e: any) {
      toast({ title: "Falha ao enviar kudos", description: e.message, variant: "destructive" });
    }
  };

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
            <Label>Para quem</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger><SelectValue placeholder="Escolha um colega" /></SelectTrigger>
              <SelectContent>
                {peopleOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as KudosCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.emoji} {m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button onClick={submit} disabled={isPending} className="gap-2"><Send className="h-4 w-4" /> Enviar</Button>
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
                  <li key={k.id} className="border rounded-lg p-3">
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
                    <p className="text-sm">{k.message}</p>
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
          <GiveKudosDialog personId={person?.id} fromName={person?.nome} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6 lg:col-span-1">
            <MyPointsCard personId={person?.id} />
            <PrefsCard personId={person?.id} />
          </div>
          <div className="space-y-6 lg:col-span-1">
            <LeaderboardCard />
          </div>
          <div className="space-y-6 lg:col-span-1">
            <KudosFeed />
          </div>
        </div>
      </div>
    </div>
  );
}
