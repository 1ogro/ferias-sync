import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Paperclip, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCreateExternalFeedback, useFeedbackScope, FeedbackChannel, FeedbackTone, FeedbackLinkInput, MAX_FEEDBACK_FILE_BYTES } from "@/hooks/useFeedbacks";

const MAX_FILE_BYTES = MAX_FEEDBACK_FILE_BYTES;

export function ExternalFeedbackDialog({
  authorId,
  defaultPersonId,
}: {
  authorId?: string;
  defaultPersonId?: string;
}) {
  const { toast } = useToast();
  const { data: people = [] } = useFeedbackScope();
  const createMut = useCreateExternalFeedback();

  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState(defaultPersonId ?? "");
  const [stakeholderName, setStakeholderName] = useState("");
  const [stakeholderOrg, setStakeholderOrg] = useState("");
  const [channel, setChannel] = useState<FeedbackChannel>("slack");
  const [tone, setTone] = useState<FeedbackTone>("positivo");
  const [feedbackDate, setFeedbackDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState("");
  const [visible, setVisible] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<FeedbackLinkInput[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const reset = () => {
    setPersonId(defaultPersonId ?? "");
    setStakeholderName("");
    setStakeholderOrg("");
    setChannel("slack");
    setTone("positivo");
    setFeedbackDate(new Date().toISOString().slice(0, 10));
    setContent("");
    setVisible(false);
    setFiles([]);
    setLinks([]);
    setLinkUrl("");
    setLinkLabel("");
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast({ title: "Arquivo muito grande", description: `${tooBig.name} passa de 1 MB. Use um link do Drive/SharePoint/Dropbox.`, variant: "destructive" });
      return;
    }
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      toast({ title: "Link inválido", description: "Informe uma URL começando com http:// ou https://.", variant: "destructive" });
      return;
    }
    setLinks((prev) => [...prev, { url, label: linkLabel.trim() || undefined }].slice(0, 5));
    setLinkUrl("");
    setLinkLabel("");
  };

  const submit = async () => {
    if (!authorId) return;
    if (!personId || stakeholderName.trim().length < 2 || content.trim().length < 5) {
      toast({ title: "Campos obrigatórios", description: "Selecione a pessoa, informe o stakeholder e escreva o feedback.", variant: "destructive" });
      return;
    }
    try {
      await createMut.mutateAsync({
        person_id: personId,
        author_id: authorId,
        stakeholder_name: stakeholderName.trim(),
        stakeholder_org: stakeholderOrg.trim() || null,
        channel,
        tone,
        feedback_date: feedbackDate,
        content: content.trim(),
        visible_to_subject: visible,
        files,
        links,
      });
      toast({ title: "Feedback registrado", description: "O registro já aparece na linha do tempo da pessoa." });
      setOpen(false);
      reset();
    } catch (e: any) {
      toast({ title: "Erro ao registrar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Registrar feedback externo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Feedback de stakeholder externo</DialogTitle>
          <DialogDescription>Registre elogios ou críticas de fora do time e anexe os prints.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Pessoa avaliada</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Selecione um colaborador" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Stakeholder</Label>
              <Input value={stakeholderName} onChange={(e) => setStakeholderName(e.target.value)} placeholder="Nome de quem elogiou" maxLength={120} />
            </div>
            <div>
              <Label>Origem / área</Label>
              <Input value={stakeholderOrg} onChange={(e) => setStakeholderOrg(e.target.value)} placeholder="Cliente, Marketing..." maxLength={120} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as FeedbackChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tom</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as FeedbackTone)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positivo">Positivo</SelectItem>
                  <SelectItem value="construtivo">Construtivo</SelectItem>
                  <SelectItem value="neutro">Neutro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={feedbackDate} onChange={(e) => setFeedbackDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Feedback</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} maxLength={2000} placeholder="Transcreva o que foi dito." />
          </div>

          <div>
            <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Prints (até 5, 1 MB cada)</Label>
            <Input type="file" multiple accept="image/*,application/pdf" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} aria-label={`Remover ${f.name}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Arquivos maiores? Suba no Drive/SharePoint/Dropbox e cole o link abaixo.</p>
          </div>

          <div>
            <Label className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Links (Drive, SharePoint, Dropbox...)</Label>
            <div className="grid grid-cols-[1fr_auto] gap-2 mt-1">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                maxLength={1000}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
              />
              <Button type="button" variant="outline" onClick={addLink}>Adicionar</Button>
            </div>
            <Input
              className="mt-2"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Rótulo do link (opcional)"
              maxLength={120}
            />
            {links.length > 0 && (
              <ul className="mt-2 space-y-1">
                {links.map((l, i) => (
                  <li key={`${l.url}-${i}`} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <span className="truncate">{l.label || l.url}</span>
                    <button type="button" onClick={() => setLinks(links.filter((_, idx) => idx !== i))} aria-label={`Remover ${l.url}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Visível para o colaborador</Label>
              <p className="text-xs text-muted-foreground">Se desligado, apenas a liderança vê este registro.</p>
            </div>
            <Switch checked={visible} onCheckedChange={setVisible} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={createMut.isPending}>
            {createMut.isPending ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
