import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { VACATION_MIN_DAYS_KEY, useVacationMinDays } from "@/hooks/useVacationMinDays";

export const VacationRulesSettings = () => {
  const current = useVacationMinDays();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const { person } = useAuth();
  const { toast } = useToast();

  useEffect(() => setValue(String(current)), [current]);

  const save = async () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 30) {
      toast({ title: "Valor inválido", description: "Use um número inteiro entre 0 e 30.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("system_settings")
      .upsert({ key: VACATION_MIN_DAYS_KEY, value: n, updated_by: person?.id ?? null });
    setSaving(false);
    toast(error
      ? { title: "Erro ao salvar", description: error.message, variant: "destructive" }
      : { title: "Regra atualizada", description: n === 0 ? "Sem período mínimo de férias." : `Mínimo de ${n} dias por pedido.` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras de férias</CardTitle>
        <CardDescription>
          Período mínimo por pedido de férias. Use 0 para não limitar. Admin e Diretoria podem abrir exceção.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="vacation-min-days">Mínimo de dias</Label>
          <Input id="vacation-min-days" type="number" min={0} max={30} className="w-28"
            value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
};
