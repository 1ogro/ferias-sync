import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useTeams, useCreateTeam } from "@/hooks/useTeams";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface TeamSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  allowCreate?: boolean;
}

export function TeamSelect({ value, onChange, disabled, id, placeholder = "Selecione o time", allowCreate }: TeamSelectProps) {
  const { person } = useAuth();
  const { toast } = useToast();
  const { data: teams = [], isLoading } = useTeams();
  const createTeam = useCreateTeam();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const canCreate =
    allowCreate ?? Boolean(person?.is_admin || ["DIRETOR", "ADMIN", "GERENTE"].includes(person?.papel || ""));

  const isLegacy = Boolean(value) && !teams.some((t) => t.nome.toLowerCase() === value.toLowerCase());

  const handleCreate = async () => {
    try {
      const team = await createTeam.mutateAsync(newName);
      onChange(team.nome);
      setNewName("");
      setAdding(false);
      toast({ title: "Time criado", description: team.nome });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={value || undefined} onValueChange={onChange} disabled={disabled || isLoading}>
          <SelectTrigger id={id} className="flex-1">
            <SelectValue placeholder={isLoading ? "Carregando times..." : placeholder} />
          </SelectTrigger>
          <SelectContent>
            {isLegacy && (
              <SelectItem value={value}>{value} (fora do padrão)</SelectItem>
            )}
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.nome}>
                {t.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCreate && !adding && (
          <Button type="button" variant="outline" size="icon" disabled={disabled} onClick={() => setAdding(true)} aria-label="Novo time">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isLegacy && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Este time não está na lista oficial. Selecione o nome padronizado.
        </p>
      )}
      {adding && (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do novo time"
            disabled={createTeam.isPending}
          />
          <Button type="button" size="sm" onClick={handleCreate} disabled={createTeam.isPending}>
            Salvar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
