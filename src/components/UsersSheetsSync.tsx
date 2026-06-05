import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Loader2, Save, AlertTriangle, XCircle, CheckCircle2, UserPlus } from "lucide-react";

interface ImportResult {
  imported: number;
  ignored: number;
  errors: number;
  ignoredList?: Array<{ nome?: string; email?: string; motivo: string }>;
  errorMessages?: Array<{ linha: number; mensagem: string }>;
}

export const UsersSheetsSync = () => {
  const [sheetId, setSheetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("integration_settings")
        .select("sheets_users_id")
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      setSheetId(data?.sheets_users_id || "");
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("integration_settings")
        .upsert({ id: "00000000-0000-0000-0000-000000000000", sheets_users_id: sheetId || null });
      if (error) throw error;
      toast.success("ID da planilha salvo");
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sheets-import-users", { body: {} });
      if (error) throw error;
      setResult(data as ImportResult);
      toast.success("Importação concluída", {
        description: `${data.imported} novos, ${data.ignored} ignorados, ${data.errors} erros`,
      });
    } catch (e: any) {
      toast.error("Erro ao importar", { description: e.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Importar Novos Usuários do Google Sheets
        </CardTitle>
        <CardDescription>
          Lê a aba <strong>Novos_Usuarios</strong> e cria cadastros pendentes para aprovação dos diretores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="users-sheet-id">ID da planilha de novos usuários</Label>
          <div className="flex gap-2">
            <Input
              id="users-sheet-id"
              placeholder="ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              disabled={loading}
            />
            <Button onClick={handleSave} disabled={saving || loading} variant="outline">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Compartilhe a planilha (leitura) com o email da Service Account configurada.
            Colunas esperadas (a partir de A2): Nome | Email | Cargo | Local | Sub-Time | Papel | Gestor (email) | Data Contrato | Modelo Contrato | Data Nascimento | Dia Pagamento.
          </p>
        </div>

        <Button onClick={handleImport} disabled={importing || !sheetId} className="w-full">
          {importing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</>
          ) : (
            <><Download className="mr-2 h-4 w-4" /> Importar Novos Usuários</>
          )}
        </Button>

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-medium">Importados</span>
                </div>
                <div className="mt-1 text-2xl font-semibold">{result.imported}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-accent-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-medium">Ignorados</span>
                </div>
                <div className="mt-1 text-2xl font-semibold">{result.ignored}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xs font-medium">Erros</span>
                </div>
                <div className="mt-1 text-2xl font-semibold">{result.errors}</div>
              </div>
            </div>

            {result.ignoredList && result.ignoredList.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="mb-2 font-semibold">Linhas ignoradas (revisar manualmente):</p>
                  <ul className="space-y-1 text-xs">
                    {result.ignoredList.map((it, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-accent-foreground/40 text-accent-foreground">Já cadastrado</Badge>
                        <span className="font-medium">{it.nome || "(sem nome)"}</span>
                        <span className="text-muted-foreground">{it.email}</span>
                        <span className="text-muted-foreground">— {it.motivo}</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {result.errorMessages && result.errorMessages.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="mb-2 font-semibold">Erros:</p>
                  <ul className="space-y-1 text-xs">
                    {result.errorMessages.map((er, i) => (
                      <li key={i}>Linha {er.linha}: {er.mensagem}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
