import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

interface EmailSetupProps {
  onSave: (fromName: string, fromAddress: string) => void;
  isSaving: boolean;
  initialFromName?: string;
  initialFromAddress?: string;
}

export function EmailSetup({ onSave, isSaving, initialFromName = '', initialFromAddress = '' }: EmailSetupProps) {
  const [fromName, setFromName] = useState(initialFromName);
  const [fromAddress, setFromAddress] = useState(initialFromAddress);
  const [errors, setErrors] = useState<{ fromName?: string; fromAddress?: string }>({});

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: { fromName?: string; fromAddress?: string } = {};
    
    if (!fromName.trim()) {
      newErrors.fromName = 'Nome do remetente é obrigatório';
    }
    
    if (!fromAddress.trim()) {
      newErrors.fromAddress = 'Email do remetente é obrigatório';
    } else if (!validateEmail(fromAddress)) {
      newErrors.fromAddress = 'Email inválido';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    onSave(fromName.trim(), fromAddress.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2 text-sm">
            <p><strong>Requisitos para usar o Resend:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Conta ativa no <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Resend.com</a></li>
              <li>Domínio verificado em <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">resend.com/domains</a></li>
              <li>Para testes, use: <code className="bg-muted px-1 rounded">onboarding@resend.dev</code></li>
            </ul>
          </div>
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="fromName">Nome do Remetente</Label>
        <Input
          id="fromName"
          placeholder="Ex: Sistema de Férias"
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          disabled={isSaving}
        />
        {errors.fromName && (
          <p className="text-sm text-destructive">{errors.fromName}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fromAddress">Email do Remetente</Label>
        <Input
          id="fromAddress"
          type="email"
          placeholder="Ex: notifications@seudominio.com"
          value={fromAddress}
          onChange={(e) => setFromAddress(e.target.value)}
          disabled={isSaving}
        />
        {errors.fromAddress && (
          <p className="text-sm text-destructive">{errors.fromAddress}</p>
        )}
        {fromAddress.includes('@resend.dev') && !errors.fromAddress && (
          <p className="text-sm text-muted-foreground">
            ⚠️ Usando domínio de testes do Resend
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSaving} className="w-full">
        {isSaving ? 'Salvando...' : 'Salvar Configuração'}
      </Button>
    </form>
  );
}
