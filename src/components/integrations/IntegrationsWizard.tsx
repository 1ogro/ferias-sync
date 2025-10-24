
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SlackSetup } from './SlackSetup';
import { SheetsSetup } from './SheetsSetup';
import { EmailSetup } from './EmailSetup';
import { useIntegrations } from '@/hooks/useIntegrations';

type IntegrationType = 'slack' | 'sheets' | 'email' | null;

interface IntegrationsWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: IntegrationType;
}

export function IntegrationsWizard({ open, onOpenChange, initialType = null }: IntegrationsWizardProps) {
  const { updateSlack, updateSheets, updateEmail, isUpdatingSlack, isUpdatingSheets, isUpdatingEmail, settings } = useIntegrations();

  const handleSlackSave = (botToken: string, channelId: string) => {
    updateSlack(
      { botToken, channelId },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  const handleSheetsSave = (params: {
    serviceAccountEmail: string;
    privateKey: string;
    sheetId: string;
    autoSync: boolean;
    syncFrequency: string;
  }) => {
    updateSheets(params, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  const handleEmailSave = (fromName: string, fromAddress: string) => {
    updateEmail(
      { fromName, fromAddress },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  const getTitle = () => {
    switch (initialType) {
      case 'slack':
        return 'Configurar Slack';
      case 'sheets':
        return 'Configurar Google Sheets';
      case 'email':
        return 'Configurar Email (Resend)';
      default:
        return 'Configurar Integração';
    }
  };

  const getDescription = () => {
    switch (initialType) {
      case 'slack':
        return 'Configure a integração com o Slack para receber notificações de aprovações';
      case 'sheets':
        return 'Configure a integração com o Google Sheets para sincronizar dados';
      case 'email':
        return 'Configure o email de remetente para notificações automáticas';
      default:
        return 'Configure suas integrações';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {initialType === 'slack' && (
            <SlackSetup onSave={handleSlackSave} isSaving={isUpdatingSlack} />
          )}
          {initialType === 'sheets' && (
            <SheetsSetup onSave={handleSheetsSave} isSaving={isUpdatingSheets} />
          )}
          {initialType === 'email' && (
            <EmailSetup 
              onSave={handleEmailSave} 
              isSaving={isUpdatingEmail}
              initialFromName={settings?.email_from_name || ''}
              initialFromAddress={settings?.email_from_address || ''}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
