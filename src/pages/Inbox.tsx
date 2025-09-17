import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestCard } from "@/components/RequestCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Request, Status } from "@/lib/types";
import { Inbox as InboxIcon, CheckCircle, XCircle, MessageCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Inbox = () => {
  const { person } = useAuth();
  const { toast } = useToast();
  const [pendingRequests, setPendingRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingRequests = async () => {
    if (!person) return;

    try {
      let query = supabase
        .from('requests')
        .select(`
          *,
          requester:people!inner(id, nome, email, papel, gestor_id)
        `);

      // Directors see all requests needing director approval
      if (person.papel === 'DIRETOR' || person.is_admin) {
        query = query.in('status', [Status.EM_ANALISE_DIRETOR, Status.EM_ANALISE_GESTOR]);
      } 
      // Managers see requests from their direct reports
      else {
        query = query
          .eq('status', Status.EM_ANALISE_GESTOR)
          .eq('requester.gestor_id', person.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching requests:', error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar as solicitações",
          variant: "destructive",
        });
        return;
      }

      setPendingRequests(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao carregar solicitações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (person) {
      fetchPendingRequests();
    }
  }, [person]);

  const handleApproval = async (requestId: string, action: 'approve' | 'reject' | 'ask_info') => {
    if (!person || processingId) return;

    setProcessingId(requestId);

    try {
      const request = pendingRequests.find(r => r.id === requestId);
      if (!request) return;

      let newStatus: Status;
      let approvalAction: string;

      if (action === 'approve') {
        // If current user is director or request is already at director level, approve final
        if (person.papel === 'DIRETOR' || person.is_admin || request.status === Status.EM_ANALISE_DIRETOR) {
          newStatus = Status.APROVADO_FINAL;
          approvalAction = 'APPROVE_FINAL';
        } else {
          // Manager approval - move to director analysis
          newStatus = Status.EM_ANALISE_DIRETOR;
          approvalAction = 'APPROVE_MANAGER';
        }
      } else if (action === 'reject') {
        newStatus = Status.REPROVADO;
        approvalAction = 'REJECT';
      } else {
        newStatus = Status.INFORMACOES_ADICIONAIS;
        approvalAction = 'REQUEST_INFO';
      }

      // Update request status
      const { error: updateError } = await supabase
        .from('requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Record approval action
      const { error: approvalError } = await supabase
        .from('approvals')
        .insert({
          request_id: requestId,
          approver_id: person.id,
          acao: approvalAction,
          level: person.papel === 'DIRETOR' || person.is_admin ? 'DIRECTOR' : 'MANAGER',
          comentario: null
        });

      if (approvalError) throw approvalError;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'requests',
          entidade_id: requestId,
          acao: approvalAction,
          actor_id: person.id,
          payload: { old_status: request.status, new_status: newStatus }
        });

      toast({
        title: "Sucesso",
        description: `Solicitação ${action === 'approve' ? 'aprovada' : action === 'reject' ? 'reprovada' : 'marcada para informações adicionais'} com sucesso`,
      });

      // Refresh the list
      fetchPendingRequests();

    } catch (error) {
      console.error('Error processing approval:', error);
      toast({
        title: "Erro",
        description: "Não foi possível processar a aprovação",
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
            {pendingRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <RequestCard 
                      request={request} 
                      showActions={false}
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
            ))}
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