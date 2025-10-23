import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SlackSetup } from './SlackSetup';
import { SheetsSetup } from './SheetsSetup';
import { useIntegrations } from '@/hooks/useIntegrations';

type IntegrationType = 'slack' | 'sheets' | null;

interface IntegrationsWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: IntegrationType;
}

export function IntegrationsWizard({ open, onOpenChange, initialType = null }: IntegrationsWizardProps) {
  const [integrationType] = useState<IntegrationType>(initialType);
  const { updateSlack, updateSheets, isUpdatingSlack, isUpdatingSheets } = useIntegrations();

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

  const getTitle = () => {
    switch (integrationType) {
      case 'slack':
        return 'Configurar Slack';
      case 'sheets':
        return 'Configurar Google Sheets';
      default:
        return 'Configurar Integração';
    }
  };

  const getDescription = () => {
    switch (integrationType) {
      case 'slack':
        return 'Configure a integração com o Slack para receber notificações de aprovações';
      case 'sheets':
        return 'Configure a integração com o Google Sheets para sincronizar dados';
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
          {integrationType === 'slack' && (
            <SlackSetup onSave={handleSlackSave} isSaving={isUpdatingSlack} />
          )}
          {integrationType === 'sheets' && (
            <SheetsSetup onSave={handleSheetsSave} isSaving={isUpdatingSheets} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
