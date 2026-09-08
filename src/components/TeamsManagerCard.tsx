import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users2, Plus, Check, X, Pencil } from "lucide-react";
import { useTeams, useCreateTeam, useRenameTeam, useToggleTeamActive } from "@/hooks/useTeams";
import { useToast } from "@/hooks/use-toast";

export function TeamsManagerCard() {
  const { toast } = useToast();
  const { data: teams = [], isLoading } = useTeams(true);
  const createTeam = useCreateTeam();
  const renameTeam = useRenameTeam();
  const toggleTeam = useToggleTeamActive();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const run = async (fn: () => Promise<unknown>, okTitle: string) => {
    try {
      await fn();
      toast({ title: okTitle });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" /> Times
        </CardTitle>
        <CardDescription>
          Lista oficial usada nos cadastros. Times desativados não aparecem mais para escolha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do novo time"
            disabled={createTeam.isPending}
          />
          <Button
            type="button"
            disabled={createTeam.isPending || newName.trim().length < 2}
            onClick={() => run(async () => { await createTeam.mutateAsync(newName); setNewName(""); }, "Time criado")}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando times...</p>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum time cadastrado.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center gap-2 p-3">
                {editingId === t.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1"
                      disabled={renameTeam.isPending}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={renameTeam.isPending}
                      onClick={() => run(async () => {
                        await renameTeam.mutateAsync({ id: t.id, nome: editingName });
                        setEditingId(null);
                      }, "Time renomeado")}
                      aria-label="Salvar nome"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{t.nome}</span>
                    {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditingId(t.id); setEditingName(t.nome); }}
                      aria-label="Renomear time"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={toggleTeam.isPending}
                      onClick={() => run(
                        () => toggleTeam.mutateAsync({ id: t.id, ativo: !t.ativo }),
                        t.ativo ? "Time desativado" : "Time reativado"
                      )}
                    >
                      {t.ativo ? "Desativar" : "Reativar"}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
