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
  email_enabled: boolean;
  email_from_address: string | null;
  email_from_name: string | null;
  email_status: string;
  email_error_message: string | null;
  email_test_date: string | null;
  figma_enabled: boolean;
  figma_client_id: string | null;
  figma_client_secret_set: boolean;
  figma_redirect_uri: string | null;
  figma_status: string;
  figma_error_message: string | null;
  figma_test_date: string | null;
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

  const syncExistingMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-existing-integrations', {});

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
        toast({
          title: 'Sincronização concluída',
          description: data.message,
        });
      } else {
        throw new Error(data.message || 'Falha na sincronização');
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Erro na sincronização',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ fromName, fromAddress }: { fromName: string; fromAddress: string }) => {
      const { data, error } = await supabase
        .from('integration_settings' as any)
        .update({
          email_enabled: true,
          email_from_name: fromName,
          email_from_address: fromAddress,
          email_status: 'configured',
          email_error_message: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      toast({
        title: "Email configurado",
        description: "Configurações do email atualizadas com sucesso",
      });
    },
    onError: (error: Error) => {
      console.error('Email update error:', error);
      toast({
        variant: "destructive",
        title: "Erro ao configurar email",
        description: error.message,
      });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-integrations', {
        body: { type: 'email' },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: async () => {
      await supabase
        .from('integration_settings' as any)
        .update({
          email_status: 'active',
          email_test_date: new Date().toISOString(),
          email_error_message: null,
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000');

      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      
      toast({
        title: "Teste bem-sucedido",
        description: "Email de teste enviado com sucesso",
      });
    },
    onError: async (error: Error) => {
      console.error('Email test error:', error);
      
      await supabase
        .from('integration_settings' as any)
        .update({
          email_status: 'error',
          email_error_message: error.message,
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000');

      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      
      toast({
        variant: "destructive",
        title: "Erro no teste de email",
        description: error.message,
      });
    },
  });

  const updateFigmaMutation = useMutation({
    mutationFn: async (params: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    }) => {
      // Store the Client Secret in Supabase Secrets via edge function
      const { error: secretError } = await supabase.functions.invoke('test-integrations', {
        body: {
          type: 'store-figma-secret',
          clientSecret: params.clientSecret,
        },
      });

      if (secretError) throw secretError;

      // Update integration_settings with Client ID and flags
      const { error: updateError } = await supabase
        .from('integration_settings' as any)
        .update({
          figma_enabled: true,
          figma_client_id: params.clientId,
          figma_client_secret_set: true,
          figma_redirect_uri: params.redirectUri,
          figma_status: 'configured',
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000');

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-settings'] });
      toast({
        title: 'Figma configurado',
        description: 'As configurações do OAuth do Figma foram salvas com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao configurar Figma',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const testFigmaMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-integrations', {
        body: { type: 'figma' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Configuração verificada',
          description: 'O OAuth do Figma está configurado corretamente.',
        });

        // Update test date
        supabase
          .from('integration_settings' as any)
          .update({
            figma_status: 'active',
            figma_test_date: new Date().toISOString(),
            figma_error_message: null,
          } as any)
          .eq('id', '00000000-0000-0000-0000-000000000000')
          .then(() => queryClient.invalidateQueries({ queryKey: ['integration-settings'] }));
      } else {
        throw new Error(data.message || 'Falha no teste');
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Falha no teste do Figma',
        description: error.message,
        variant: 'destructive',
      });

      // Update error status
      supabase
        .from('integration_settings' as any)
        .update({
          figma_status: 'error',
          figma_error_message: error.message,
        } as any)
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .then(() => queryClient.invalidateQueries({ queryKey: ['integration-settings'] }));
    },
  });

  const verifyFigmaConfigMutation = useMutation({
    mutationFn: async (): Promise<{ secretClientId: string | null; hasClientSecret: boolean }> => {
      const { data, error } = await supabase.functions.invoke('test-integrations', {
        body: { type: 'verify-figma-config' },
      });

      if (error) throw error;
      return data;
    },
  });

  return {
    settings,
    isLoading,
    updateSlack: updateSlackMutation.mutate,
    updateSheets: updateSheetsMutation.mutate,
    updateEmail: updateEmailMutation.mutate,
    updateFigma: updateFigmaMutation.mutate,
    testSlack: testSlackMutation.mutate,
    testSheets: testSheetsMutation.mutate,
    testEmail: testEmailMutation.mutate,
    testFigma: testFigmaMutation.mutate,
    syncExisting: syncExistingMutation.mutate,
    verifyFigmaConfig: verifyFigmaConfigMutation.mutateAsync,
    isUpdatingSlack: updateSlackMutation.isPending,
    isUpdatingSheets: updateSheetsMutation.isPending,
    isUpdatingEmail: updateEmailMutation.isPending,
    isUpdatingFigma: updateFigmaMutation.isPending,
    isTestingSlack: testSlackMutation.isPending,
    isTestingSheets: testSheetsMutation.isPending,
    isTestingEmail: testEmailMutation.isPending,
    isTestingFigma: testFigmaMutation.isPending,
    isVerifyingFigma: verifyFigmaConfigMutation.isPending,
    isSyncing: syncExistingMutation.isPending,
  };
}
