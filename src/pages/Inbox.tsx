import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequestCard } from "@/components/RequestCard";
import { mockRequests } from "@/lib/mockData";
import { Status } from "@/lib/types";
import { Inbox as InboxIcon, CheckCircle, XCircle, MessageCircle, Trash2 } from "lucide-react";

const Inbox = () => {
  // Mock pending requests for approval
  const pendingApprovals = mockRequests.filter(req => 
    [Status.EM_ANALISE_GESTOR, Status.EM_ANALISE_DIRETOR].includes(req.status)
  );

  const handleApproval = (requestId: string, action: 'approve' | 'reject' | 'ask_info') => {
    console.log(`${action} request ${requestId}`);
    // Mock approval action
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

        {pendingApprovals.length > 0 ? (
          <div className="space-y-4">
            {pendingApprovals.map((request) => (
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
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      size="sm" 
                      onClick={() => handleApproval(request.id, 'approve')}
                      className="bg-status-approved hover:bg-status-approved/90 text-white"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Aprovar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleApproval(request.id, 'reject')}
                      className="border-status-rejected text-status-rejected hover:bg-status-rejected/10"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reprovar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleApproval(request.id, 'ask_info')}
                    >
                      <MessageCircle className="w-4 h-4 mr-1" />
                      Pedir Informações
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleApproval(request.id, 'ask_info')}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Cancelar
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