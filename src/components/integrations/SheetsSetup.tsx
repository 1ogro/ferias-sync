import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface SheetsSetupProps {
  onSave: (params: {
    serviceAccountEmail: string;
    privateKey: string;
    sheetId: string;
    autoSync: boolean;
    syncFrequency: string;
  }) => void;
  isSaving?: boolean;
}

export function SheetsSetup({ onSave, isSaving }: SheetsSetupProps) {
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState('manual');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!serviceAccountEmail) {
      newErrors.serviceAccountEmail = 'Email da conta de serviço é obrigatório';
    } else if (!serviceAccountEmail.includes('@')) {
      newErrors.serviceAccountEmail = 'Email inválido';
    }

    if (!privateKey) {
      newErrors.privateKey = 'Chave privada é obrigatória';
    } else {
      try {
        const parsed = JSON.parse(privateKey);
        if (!parsed.private_key) {
          newErrors.privateKey = 'JSON inválido: falta private_key';
        }
      } catch {
        newErrors.privateKey = 'JSON inválido';
      }
    }

    if (!sheetId) {
      newErrors.sheetId = 'ID da planilha é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave({
        serviceAccountEmail,
        privateKey,
        sheetId,
        autoSync,
        syncFrequency,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Para configurar o Google Sheets, você precisa criar uma conta de serviço no Google Cloud Console
          e compartilhar sua planilha com o email da conta de serviço.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="service-account-email">Email da Conta de Serviço *</Label>
        <Input
          id="service-account-email"
          type="email"
          placeholder="service-account@project.iam.gserviceaccount.com"
          value={serviceAccountEmail}
          onChange={(e) => setServiceAccountEmail(e.target.value)}
          className={errors.serviceAccountEmail ? 'border-destructive' : ''}
        />
        {errors.serviceAccountEmail && (
          <p className="text-sm text-destructive">{errors.serviceAccountEmail}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="private-key">Chave Privada (JSON) *</Label>
        <Textarea
          id="private-key"
          placeholder='{"type": "service_account", "private_key": "..."}'
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          className={`min-h-[120px] font-mono text-xs ${errors.privateKey ? 'border-destructive' : ''}`}
        />
        {errors.privateKey && (
          <p className="text-sm text-destructive">{errors.privateKey}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Cole o conteúdo completo do arquivo JSON da conta de serviço
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sheet-id">ID da Planilha *</Label>
        <Input
          id="sheet-id"
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
          value={sheetId}
          onChange={(e) => setSheetId(e.target.value)}
          className={errors.sheetId ? 'border-destructive' : ''}
        />
        {errors.sheetId && (
          <p className="text-sm text-destructive">{errors.sheetId}</p>
        )}
        <p className="text-sm text-muted-foreground">
          O ID está na URL da planilha: docs.google.com/spreadsheets/d/[ID]/edit
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="auto-sync">Sincronização Automática</Label>
          <p className="text-sm text-muted-foreground">
            Sincronizar automaticamente com a planilha
          </p>
        </div>
        <Switch
          id="auto-sync"
          checked={autoSync}
          onCheckedChange={setAutoSync}
        />
      </div>

      {autoSync && (
        <div className="space-y-2">
          <Label htmlFor="sync-frequency">Frequência de Sincronização</Label>
          <Select value={syncFrequency} onValueChange={setSyncFrequency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="hourly">A cada hora</SelectItem>
              <SelectItem value="daily">Diariamente</SelectItem>
              <SelectItem value="weekly">Semanalmente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="submit" disabled={isSaving} className="w-full">
        {isSaving ? 'Salvando...' : 'Salvar Configuração'}
      </Button>
    </form>
  );
}
