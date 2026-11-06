import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Send, Trash2, Copy } from "lucide-react";

type Leader = { id: string; nome: string; papel: string | null; is_admin: boolean | null };
type ExtDirector = { id: string; nome: string; area: string | null; whatsapp: string };

const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

export const reportUrl = (token: string) => `${APP_URL}/relatorio-lideranca?token=${token}`;

export function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export default function LeadershipShareCard() {
  const { toast } = useToast();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [externals, setExternals] = useState<ExtDirector[]>([]);
  const [extId, setExtId] = useState<string>("new");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [phone, setPhone] = useState("");
  const [save, setSave] = useState(true);
  const [days, setDays] = useState("14");

  const loadExternals = async () => {
    const { data } = await supabase.from("external_directors" as any).select("id, nome, area, whatsapp").eq("ativo", true).order("nome");
    setExternals((data as any) ?? []);
  };

  useEffect(() => {
    supabase
      .from("people")
      .select("id, nome, papel, is_admin")
      .neq("ativo", false)
      .in("papel", ["GESTOR", "GERENTE", "DIRETOR"])
      .order("nome")
      .then(({ data }) => setLeaders((data as Leader[]) ?? []));
    loadExternals();
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const sendSlack = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("leadership-report-slack", {
      body: { person_ids: [...selected], days: Number(days) },
    });
    setSending(false);
    if (error || data?.error) {
      toast({ title: "Não foi possível enviar", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    const failed = (data.results as any[]).filter((r) => !r.sent);
    toast({
      title: `Enviado para ${data.results.length - failed.length} pessoa(s) no Slack`,
      description: failed.length ? `Sem Slack: ${failed.map((f) => f.nome).join(", ")}` : undefined,
    });
    setSelected(new Set());
  };

  const current = useMemo(() => externals.find((e) => e.id === extId), [externals, extId]);

  const shareWhatsApp = async () => {
    const n = current?.nome ?? name.trim();
    const ph = current?.whatsapp ?? phone.trim();
    if (n.length < 2 || ph.replace(/\D/g, "").length < 10) {
      toast({ title: "Informe nome e WhatsApp com DDD", variant: "destructive" });
      return;
    }
    // Abre a aba antes do await para não ser bloqueada pelo navegador.
    const win = window.open("", "_blank");
    let externalId = current?.id ?? null;
    if (!current && save) {
      const { data: ins } = await supabase
        .from("external_directors" as any)
        .insert({ nome: n, area: area.trim() || null, whatsapp: ph })
        .select("id")
        .single();
      externalId = (ins as any)?.id ?? null;
      loadExternals();
    }
    const { data, error } = await supabase.rpc("create_leadership_report_link" as any, {
      p_scope: "global",
      p_recipient_name: n,
      p_external_director_id: externalId,
      p_recipient_phone: ph,
      p_channel: "whatsapp",
      p_days: Number(days),
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.token) {
      win?.close();
      toast({ title: "Erro ao gerar link", description: error?.message, variant: "destructive" });
      return;
    }
    const text = `Olá, ${n.split(" ")[0]}! Segue o relatório de engajamento e bem-estar do time de UX, sem precisar de login:\n${reportUrl(row.token)}\n(Link válido por ${days} dias.)`;
    const href = waLink(ph, text);
    if (win) win.location.href = href;
    else window.location.href = href;
    setName(""); setArea(""); setPhone("");
  };

  const removeExternal = async (id: string) => {
    await supabase.from("external_directors" as any).update({ ativo: false }).eq("id", id);
    setExtId("new");
    loadExternals();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compartilhar relatório com a liderança</CardTitle>
        <CardDescription>
          Envia um link pessoal, sem login, com engajamento do mês e histórico de bem-estar. Gestores veem só o próprio time; diretores veem a empresa.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2"><Send className="h-4 w-4" /> Pelo Slack (cadastrados)</h4>
          <div className="max-h-64 overflow-auto rounded-md border divide-y">
            {leaders.map((l) => (
              <label key={l.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                <span className="flex-1 text-sm">{l.nome}</span>
                <Badge variant="outline">{l.papel === "DIRETOR" || l.is_admin ? "Empresa" : "Time"}</Badge>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set(leaders.map((l) => l.id)))}>Selecionar todos</Button>
            <Button onClick={sendSlack} disabled={!selected.size || sending} className="ml-auto">
              {sending ? "Enviando..." : `Enviar para ${selected.size}`}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Pelo WhatsApp (diretores de outras áreas)</h4>
          <div className="space-y-1">
            <Label>Destinatário</Label>
            <div className="flex gap-2">
              <Select value={extId} onValueChange={setExtId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">+ Nova pessoa</SelectItem>
                  {externals.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}{e.area ? ` · ${e.area}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {current && (
                <Button variant="ghost" size="icon" aria-label="Remover da lista" onClick={() => removeExternal(current.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {!current && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Área" value={area} onChange={(e) => setArea(e.target.value)} />
              <Input placeholder="WhatsApp com DDD" value={phone} onChange={(e) => setPhone(e.target.value)} className="sm:col-span-2" />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={save} onCheckedChange={(v) => setSave(!!v)} /> Salvar na lista para os próximos envios
              </label>
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label>Validade</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["7", "14", "30"].map((d) => <SelectItem key={d} value={d}>{d} dias</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={shareWhatsApp} className="ml-auto"><Copy className="h-4 w-4 mr-1" /> Abrir no WhatsApp</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
