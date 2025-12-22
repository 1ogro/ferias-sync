import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestCard } from "@/components/RequestCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Request, Status, TipoAusencia } from "@/lib/types";
import { Inbox as InboxIcon, CheckCircle, XCircle, MessageCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Inbox = () => {
  const { person } = useAuth();
  const { toast } = useToast();
  const [pendingRequests, setPendingRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentUserPerson, setCurrentUserPerson] = useState<any>(null);

  const fetchPendingRequests = async () => {
    if (!person) {
      console.log('No person found, skipping fetch');
      return;
    }

    console.log('Fetching pending requests for:', person.nome, 'Role:', person.papel);
    setLoading(true);

    try {
      // First, get all pending requests with requester info
      const baseQuery = supabase
        .from('requests')
        .select(`
          *,
          requester:people!inner(id, nome, email, papel, gestor_id)
        `);

      let { data, error } = await baseQuery.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching requests:', error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar as solicitações",
          variant: "destructive",
        });
        return;
      }

      console.log('Raw data received:', data?.length || 0, 'requests');

      // Filter data based on user role and status
      let filteredData = data || [];

      if (person.papel === 'DIRETOR' || person.is_admin) {
        // Directors see all requests needing approval (including PENDENTE)
        filteredData = filteredData.filter(item => 
          [Status.PENDENTE, Status.EM_ANALISE_DIRETOR, Status.EM_ANALISE_GESTOR].includes(item.status as Status)
        );
        console.log('Director view: filtered to', filteredData.length, 'requests');
      } else {
        // Managers see requests from their direct reports that need manager approval
        filteredData = filteredData.filter(item => 
          item.status === Status.EM_ANALISE_GESTOR && 
          item.requester.gestor_id === person.id
        );
        console.log('Manager view: filtered to', filteredData.length, 'requests for gestor_id:', person.id);
      }

      // Transform the data to match Request type
      const transformedData = filteredData.map(item => {
        console.log('Transforming request:', item.id, 'from:', item.requester.nome, 'status:', item.status);
        return {
          id: item.id,
          requesterId: item.requester_id,
          tipo: item.tipo as TipoAusencia,
          inicio: item.inicio ? new Date(item.inicio) : null,
          fim: item.fim ? new Date(item.fim) : null,
          justificativa: item.justificativa,
          status: item.status as Status,
          diasAbono: item.dias_abono,
          createdAt: new Date(item.created_at),
          updatedAt: new Date(item.updated_at),
          conflitoFlag: item.conflito_flag,
          requester: {
            ...item.requester,
            papel: item.requester.papel as any,
            is_admin: false,
            ativo: true
          }
        };
      });

      console.log('Final transformed data:', transformedData.length, 'requests');
      setPendingRequests(transformedData);

    } catch (error) {
      console.error('Unexpected error fetching requests:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao carregar solicitações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch requests when component mounts or person changes
  useEffect(() => {
    if (person) {
      console.log('Person available, fetching pending requests');
      fetchPendingRequests();
    } else {
      console.log('No person found, setting loading to false');
      setLoading(false);
    }
  }, [person]);

  // Add refresh functionality after component mounts
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && person) {
        console.log('Page became visible, refreshing inbox data');
        fetchPendingRequests();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [person]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!person) return;
      
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('person_id, people!inner(*)')
        .eq('user_id', userData.user.id)
        .single();
      
      if (profile?.people) {
        setCurrentUserPerson(profile.people);
      }
    };
    
    if (person) {
      fetchCurrentUser();
    }
  }, [person]);

  const handleApproval = async (requestId: string, action: 'approve' | 'reject' | 'ask_info') => {
    if (!person || processingId) {
      console.log('Approval blocked - no person or already processing');
      return;
    }

    console.log('Processing approval:', { requestId, action, userRole: person.papel, userId: person.id });
    setProcessingId(requestId);

    try {
      const request = pendingRequests.find(r => r.id === requestId);
      if (!request) {
        console.error('Request not found in local state:', requestId);
        toast({
          title: "Erro",
          description: "Solicitação não encontrada",
          variant: "destructive",
        });
        return;
      }

      console.log('Processing request:', {
        id: request.id,
        currentStatus: request.status,
        requester: request.requester?.nome
      });

      // Validate permissions
      const canApprove = (
        (person.papel === 'DIRETOR' || person.is_admin) ||
        (person.papel === 'GESTOR' && request.requester && 'gestor_id' in request.requester && (request.requester as any).gestor_id === person.id)
      );

      if (!canApprove) {
        console.error('User lacks permission to approve this request');
        toast({
          title: "Erro",
          description: "Você não tem permissão para aprovar esta solicitação",
          variant: "destructive",
        });
        return;
      }

      let newStatus: Status;
      let approvalAction: string;

      if (action === 'approve') {
        // If current user is director or request is already at director level, approve final
        if (person.papel === 'DIRETOR' || person.is_admin || request.status === Status.EM_ANALISE_DIRETOR) {
          newStatus = Status.APROVADO_FINAL;
          approvalAction = 'APROVAR';
        } else {
          // Manager approval - move to director analysis
          newStatus = Status.EM_ANALISE_DIRETOR;  
          approvalAction = 'APROVAR';
        }
      } else if (action === 'reject') {
        newStatus = Status.REPROVADO;
        approvalAction = 'REPROVAR';
      } else {
        newStatus = Status.INFORMACOES_ADICIONAIS;
        approvalAction = 'PEDIR_INFO';
      }

      console.log('Status transition:', request.status, '->', newStatus);

      // Update request status
      const { error: updateError } = await supabase
        .from('requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating request status:', updateError);
        throw updateError;
      }

      console.log('Request status updated successfully');

      // Record approval action
      const { error: approvalError } = await supabase
        .from('approvals')
        .insert({
          request_id: requestId,
          approver_id: person.id,
          acao: approvalAction,
          level: person.papel === 'DIRETOR' || person.is_admin ? 'DIRETOR_2' : 'GESTOR_1',
          comentario: null
        });

      if (approvalError) {
        console.error('Error recording approval:', approvalError);
        throw approvalError;
      }

      console.log('Approval recorded successfully');

      // Create audit log
      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: requestId,
          acao: approvalAction,
          actor_id: person.id,
          payload: { old_status: request.status, new_status: newStatus }
        });

      if (auditError) {
        console.warn('Error creating audit log (non-critical):', auditError);
      }

      // Send email notification to requester
      try {
        const { data: requesterData } = await supabase
          .from('people')
          .select('email')
          .eq('id', request.requesterId)
          .single();

        if (requesterData?.email) {
          let notificationType: 'APPROVAL_MANAGER' | 'APPROVAL_FINAL' | 'REJECTION' | 'REQUEST_INFO';
          
          if (action === 'reject') {
            notificationType = 'REJECTION';
          } else if (action === 'ask_info') {
            notificationType = 'REQUEST_INFO';
          } else if (newStatus === Status.APROVADO_FINAL) {
            notificationType = 'APPROVAL_FINAL';
          } else {
            notificationType = 'APPROVAL_MANAGER';
          }

          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: notificationType,
              to: requesterData.email,
              requesterName: request.requester?.nome || '',
              requestType: request.tipo,
              startDate: request.inicio ? new Date(request.inicio).toLocaleDateString('pt-BR') : undefined,
              endDate: request.fim ? new Date(request.fim).toLocaleDateString('pt-BR') : undefined,
              approverName: person.nome,
            }
          });
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't block the flow if email fails
      }

      // Send Slack notification
      try {
        let slackType: 'APPROVAL' | 'REJECTION' | 'REQUEST_INFO';
        if (action === 'reject') {
          slackType = 'REJECTION';
        } else if (action === 'ask_info') {
          slackType = 'REQUEST_INFO';
        } else {
          slackType = 'APPROVAL';
        }

        await supabase.functions.invoke('slack-notification', {
          body: {
            type: slackType,
            requestId: requestId,
            requesterName: request.requester?.nome || '',
            requestType: request.tipo,
            startDate: request.inicio ? new Date(request.inicio).toLocaleDateString('pt-BR') : '',
            endDate: request.fim ? new Date(request.fim).toLocaleDateString('pt-BR') : '',
            comment: null,
          }
        });
      } catch (slackError) {
        console.error('Error sending Slack notification:', slackError);
        // Don't block the flow if Slack fails
      }

      toast({
        title: "Sucesso",
        description: `Solicitação ${action === 'approve' ? 'aprovada' : action === 'reject' ? 'reprovada' : 'marcada para informações adicionais'} com sucesso`,
      });

      console.log('Approval process completed successfully');

      // Refresh the list to show updated data
      await fetchPendingRequests();

      // Trigger a custom event to update other components
      window.dispatchEvent(new CustomEvent('requestStatusUpdated', { 
        detail: { requestId, newStatus, action } 
      }));

    } catch (error) {
      console.error('Error processing approval:', error);
      toast({
        title: "Erro",
        description: `Não foi possível processar a aprovação: ${error.message || 'Erro desconhecido'}`,
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <InboxIcon className="w-8 h-8 text-primary" />
            Caixa de Entrada
          </h1>
          <p className="text-muted-foreground mt-2">
            Solicitações pendentes de aprovação
          </p>
        </div>

        {loading ? (
          <Card className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando solicitações...</p>
          </Card>
        ) : pendingRequests.length > 0 ? (
          <div className="space-y-4">
            {pendingRequests.map((request) => {
              const isUserManagerOfRequester = person?.id === request.requester.gestorId;
              
              return (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <RequestCard 
                        request={request} 
                        showActions={true}
                        currentUserRole={person?.papel}
                        isUserManager={isUserManagerOfRequester}
                        currentUserId={person?.id}
                        onEdit={(req) => window.location.href = `/requests/${req.id}/edit`}
                      />
                    </div>
                  </CardHeader>
                <CardContent className="pt-0">
                  <div className="mb-3">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Solicitante:</span> {request.requester?.nome}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Email:</span> {request.requester?.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      size="sm" 
                      onClick={() => handleApproval(request.id, 'approve')}
                      disabled={processingId !== null}
                      className="bg-status-approved hover:bg-status-approved/90 text-white disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {processingId === request.id ? 'Aprovando...' : 'Aprovar'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleApproval(request.id, 'reject')}
                      disabled={processingId !== null}
                      className="border-status-rejected text-status-rejected hover:bg-status-rejected/10 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      {processingId === request.id ? 'Reprovando...' : 'Reprovar'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleApproval(request.id, 'ask_info')}
                      disabled={processingId !== null}
                      className="disabled:opacity-50"
                    >
                      <MessageCircle className="w-4 h-4 mr-1" />
                      Pedir Informações
                    </Button>
                  </div>
                </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <InboxIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma solicitação pendente</h3>
            <p className="text-muted-foreground">
              Todas as solicitações foram processadas.
            </p>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Inbox;