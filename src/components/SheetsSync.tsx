import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const SheetsSync = () => {
  const [importing, setImporting] = useState(false);
  const [exportingRequests, setExportingRequests] = useState(false);
  const [exportingBalances, setExportingBalances] = useState(false);
  const [lastSync, setLastSync] = useState<{ type: string; timestamp: string; result: any } | null>(null);

  const handleImport = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('sheets-import', {
        body: {},
      });

      if (error) throw error;

      setLastSync({
        type: 'IMPORT',
        timestamp: new Date().toISOString(),
        result: data,
      });

      toast.success(`Importação concluída`, {
        description: `${data.imported} novos, ${data.updated} atualizados, ${data.errors} erros`,
      });
    } catch (error: any) {
      console.error('Error importing from sheets:', error);
      toast.error('Erro ao importar', {
        description: error.message,
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExportRequests = async () => {
    setExportingRequests(true);
    try {
      const { data, error } = await supabase.functions.invoke('sheets-export', {
        body: { type: 'requests' },
      });

      if (error) throw error;

      setLastSync({
        type: 'EXPORT_REQUESTS',
        timestamp: new Date().toISOString(),
        result: data,
      });

      toast.success('Solicitações exportadas com sucesso');
    } catch (error: any) {
      console.error('Error exporting requests:', error);
      toast.error('Erro ao exportar solicitações', {
        description: error.message,
      });
    } finally {
      setExportingRequests(false);
    }
  };

  const handleExportBalances = async () => {
    setExportingBalances(true);
    try {
      const { data, error } = await supabase.functions.invoke('sheets-export', {
        body: { type: 'vacation_balances' },
      });

      if (error) throw error;

      setLastSync({
        type: 'EXPORT_BALANCES',
        timestamp: new Date().toISOString(),
        result: data,
      });

      toast.success('Saldos de férias exportados com sucesso');
    } catch (error: any) {
      console.error('Error exporting balances:', error);
      toast.error('Erro ao exportar saldos', {
        description: error.message,
      });
    } finally {
      setExportingBalances(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📊 Sincronização Google Sheets
          </CardTitle>
          <CardDescription>
            Importe colaboradores e exporte dados para planilhas Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {lastSync ? (
                <>
                  Última sincronização: {new Date(lastSync.timestamp).toLocaleString('pt-BR')} - {lastSync.type}
                </>
              ) : (
                'Nenhuma sincronização realizada ainda'
              )}
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Importação</h3>
              <Button 
                onClick={handleImport} 
                disabled={importing}
                className="w-full"
                variant="outline"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Importar Colaboradores do Sheets
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Lê a aba "Colaboradores" e atualiza o banco de dados
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Exportação</h3>
              <div className="grid gap-2">
                <Button 
                  onClick={handleExportRequests} 
                  disabled={exportingRequests}
                  className="w-full"
                  variant="outline"
                >
                  {exportingRequests ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Exportar Solicitações
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleExportBalances} 
                  disabled={exportingBalances}
                  className="w-full"
                  variant="outline"
                >
                  {exportingBalances ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Exportar Saldos de Férias
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Atualiza as abas "Requests_Export" e "Saldos_Ferias"
              </p>
            </div>
          </div>

          {lastSync?.result?.errorMessages && lastSync.result.errorMessages.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold">Erros encontrados:</p>
                <ul className="list-disc list-inside text-xs mt-2">
                  {lastSync.result.errorMessages.map((msg: string, i: number) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📋 Estrutura da Planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold">Aba "Colaboradores" (Importação)</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Colunas: ID | Nome | Email | Cargo | Sub-Time | Papel | Data Nascimento | Data Contrato | Modelo Contrato | Ativo
            </p>
          </div>
          <div>
            <h4 className="font-semibold">Aba "Requests_Export" (Exportação)</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Colunas: Request ID | Colaborador | Tipo | Início | Fim | Status | Criado em
            </p>
          </div>
          <div>
            <h4 className="font-semibold">Aba "Saldos_Ferias" (Exportação)</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Colunas: Colaborador | Ano | Dias Acumulados | Dias Usados | Saldo | Aniversário Contrato
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
