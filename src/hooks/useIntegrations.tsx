import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface IntegrationSettings {
  id: string;
  slack_enabled: boolean;
  slack_bot_token_set: boolean;
  slack_channel_approvals: string | null;
  slack_status: string;
  slack_error_message: string | null;
  slack_test_date: string | null;
  sheets_enabled: boolean;
  sheets_service_account_set: boolean;
  sheets_id: string | null;
  sheets_status: string;
  sheets_error_message: string | null;
  sheets_last_sync: string | null;
  sheets_auto_sync: boolean;
  sheets_sync_frequency: string;
  configured_by: string | null;
  configured_at: string;
  updated_at: string;
}

export function useIntegrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['integration-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings' as any)
        .select('*')
        .single();

      if (error) throw error;
      return data as unknown as IntegrationSettings;
    },
  });

  const updateSlackMutation = useMutation({
    mutationFn: async (params: {
      botToken: string;
      channelId: string;
    }) => {
      const { error } = await supabase
        .from('integration_settings' as any)
        .update({
          slack_bot_token_set: true,
          slack_channel_approvals: params.channelId,
          slack_enabled: true,
          slack_status: 'configured',
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;

      // Store the actual token in secrets
      // This would need to be done via an edge function for security
      await supabase.functions.invoke('test-integrations', {
        body: {
          type: 'store-slack-token',
          token: params.botToken,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      toast({
        title: 'Slack configurado',
        description: 'As configurações do Slack foram salvas com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao configurar Slack',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateSheetsMutation = useMutation({
    mutationFn: async (params: {
      serviceAccountEmail: string;
      privateKey: string;
      sheetId: string;
      autoSync: boolean;
      syncFrequency: string;
    }) => {
      const { error } = await supabase
        .from('integration_settings' as any)
        .update({
          sheets_service_account_set: true,
          sheets_id: params.sheetId,
          sheets_enabled: true,
          sheets_auto_sync: params.autoSync,
          sheets_sync_frequency: params.syncFrequency,
          sheets_status: 'configured',
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;

      // Store the actual credentials in secrets via edge function
      await supabase.functions.invoke('test-integrations', {
        body: {
          type: 'store-sheets-credentials',
          email: params.serviceAccountEmail,
          privateKey: params.privateKey,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      toast({
        title: 'Google Sheets configurado',
        description: 'As configurações do Google Sheets foram salvas com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao configurar Google Sheets',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const testSlackMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-integrations', {
        body: { type: 'slack' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Conexão bem-sucedida',
          description: 'O Slack está configurado e funcionando corretamente.',
        });
        
        // Update test date
        supabase
          .from('integration_settings' as any)
          .update({
            slack_status: 'active',
            slack_test_date: new Date().toISOString(),
            slack_error_message: null,
          } as any)
          .eq('id', '00000000-0000-0000-0000-000000000000')
          .then(() => queryClient.invalidateQueries({ queryKey: ['integration-settings'] }));
      } else {
        throw new Error(data.message || 'Falha no teste');
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Falha no teste do Slack',
        description: error.message,
        variant: 'destructive',
      });

      // Update error status
      supabase
        .from('integration_settings' as any)
        .update({
          slack_status: 'error',
          slack_error_message: error.message,
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .then(() => queryClient.invalidateQueries({ queryKey: ['integration-settings'] }));
    },
  });

  const testSheetsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-integrations', {
        body: { type: 'sheets' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Conexão bem-sucedida',
          description: 'O Google Sheets está configurado e funcionando corretamente.',
        });

        // Update test date
        supabase
          .from('integration_settings' as any)
          .update({
            sheets_status: 'active',
            sheets_last_sync: new Date().toISOString(),
            sheets_error_message: null,
          } as any)
          .eq('id', '00000000-0000-0000-0000-000000000000')
          .then(() => queryClient.invalidateQueries({ queryKey: ['integration-settings'] }));
      } else {
        throw new Error(data.message || 'Falha no teste');
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Falha no teste do Google Sheets',
        description: error.message,
        variant: 'destructive',
      });

      // Update error status
      supabase
        .from('integration_settings' as any)
        .update({
          sheets_status: 'error',
          sheets_error_message: error.message,
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .then(() => queryClient.invalidateQueries({ queryKey: ['integration-settings'] }));
    },
  });

  return {
    settings,
    isLoading,
    updateSlack: updateSlackMutation.mutate,
    updateSheets: updateSheetsMutation.mutate,
    testSlack: testSlackMutation.mutate,
    testSheets: testSheetsMutation.mutate,
    isUpdatingSlack: updateSlackMutation.isPending,
    isUpdatingSheets: updateSheetsMutation.isPending,
    isTestingSlack: testSlackMutation.isPending,
    isTestingSheets: testSheetsMutation.isPending,
  };
}
