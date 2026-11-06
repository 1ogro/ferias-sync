import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { VACATION_MIN_DAYS_KEY, useVacationMinDays } from "@/hooks/useVacationMinDays";
import { RULE_KEYS, useVacationRuleSettings } from "@/hooks/useVacationRules";

const FIELDS = [
  { key: VACATION_MIN_DAYS_KEY, label: "Mínimo de dias por pedido", max: 30 },
  { key: RULE_KEYS.advanceClt, label: "Antecedência mínima CLT (dias)", max: 120 },
  { key: RULE_KEYS.advancePj, label: "Antecedência mínima PJ (dias)", max: 120 },
  { key: RULE_KEYS.minGap, label: "Intervalo mínimo entre períodos (dias)", max: 120 },
];

export const VacationRulesSettings = () => {
  const minDays = useVacationMinDays();
  const rules = useVacationRuleSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { person } = useAuth();
  const { toast } = useToast();

  useEffect(() => setValues({
    [VACATION_MIN_DAYS_KEY]: String(minDays),
    [RULE_KEYS.advanceClt]: String(rules.advanceClt),
    [RULE_KEYS.advancePj]: String(rules.advancePj),
    [RULE_KEYS.minGap]: String(rules.minGap),
  }), [minDays, rules]);

  const save = async () => {
    const rows = [];
    for (const f of FIELDS) {
      const n = Number(values[f.key]);
      if (!Number.isInteger(n) || n < 0 || n > f.max) {
        toast({ title: "Valor inválido", description: `${f.label}: use um inteiro entre 0 e ${f.max}.`, variant: "destructive" });
        return;
      }
      rows.push({ key: f.key, value: n, updated_by: person?.id ?? null });
    }
    setSaving(true);
    const { error } = await (supabase as any).from("system_settings").upsert(rows);
    setSaving(false);
    toast(error
      ? { title: "Erro ao salvar", description: error.message, variant: "destructive" }
      : { title: "Regras de férias atualizadas" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras de férias</CardTitle>
        <CardDescription>
          Use 0 para desligar uma regra. Admin e Diretoria podem enviar pedidos como exceção.
          Saldos com vencimento em até 90 dias aparecem como "Atenção" e em menos de 60 dias como "Crítico".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input id={f.key} type="number" min={0} max={f.max} className="w-28"
                value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
};
