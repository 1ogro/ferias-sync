import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { abonoOptions, decimoMonthAllowed, isCltModel } from "@/lib/cltBenefits";

/** Verifica se o colaborador já pediu o 13º em outro pedido de férias do mesmo ano. */
export function useDecimoUsedThisYear(personId?: string | null, inicio?: string, excludeId?: string) {
  const [used, setUsed] = useState(false);
  const year = inicio?.slice(0, 4);
  useEffect(() => {
    if (!personId || !year) { setUsed(false); return; }
    let q = supabase.from("requests").select("id")
      .eq("requester_id", personId).eq("tipo", "FERIAS").eq("solicita_13", true)
      .not("status", "in", "(CANCELADO,REPROVADO,RASCUNHO)")
      .gte("inicio", `${year}-01-01`).lte("inicio", `${year}-12-31`);
    if (excludeId) q = q.neq("id", excludeId);
    q.limit(1).then(({ data }) => setUsed((data?.length ?? 0) > 0));
  }, [personId, year, excludeId]);
  return used;
}

interface Props {
  model?: string | null;
  inicio?: string;
  diasAbono: number;
  solicita13: boolean;
  decimoUsedThisYear: boolean;
  showAbono?: boolean;
  onChange: (v: { dias_abono?: number; solicita_13?: boolean }) => void;
}

export function CltBenefitsFields({ model, inicio, diasAbono, solicita13, decimoUsedThisYear, showAbono = true, onChange }: Props) {
  if (!isCltModel(model)) return null;
  const { max, fixed } = abonoOptions(model);
  const monthOk = decimoMonthAllowed(inicio);
  const decimoDisabled = !monthOk || (decimoUsedThisYear && !solicita13);

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      {showAbono && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <Label className="text-base font-medium">Abono de férias (venda de dias)</Label>
          </div>
          {fixed.length ? (
            <Select value={String(diasAbono)} onValueChange={(v) => onChange({ dias_abono: parseInt(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {fixed.map((o) => <SelectItem key={o} value={String(o)}>{o === 0 ? "Não vender dias" : `Vender ${o} dias`}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input type="number" min={0} max={max} value={diasAbono}
              onChange={(e) => onChange({ dias_abono: Math.max(0, parseInt(e.target.value) || 0) })} />
          )}
          <p className="text-xs text-muted-foreground">Até {max} dias. Os dias vendidos também saem do seu saldo.</p>
        </div>
      )}
      <div className="flex items-start gap-3">
        <Checkbox id="solicita_13" checked={solicita13} disabled={decimoDisabled}
          onCheckedChange={(c) => onChange({ solicita_13: c === true })} />
        <div className="space-y-1">
          <Label htmlFor="solicita_13" className="font-medium">Solicitar adiantamento da 1ª parcela do 13º salário</Label>
          <p className="text-xs text-muted-foreground">
            {!inicio ? "Escolha a data de início para ver se pode pedir."
              : !monthOk ? "Só vale para férias que começam entre fevereiro e novembro."
              : decimoUsedThisYear && !solicita13 ? "Você já pediu o adiantamento do 13º neste ano."
              : "Pode ser pedido uma vez por ano, junto com as férias."}
          </p>
        </div>
      </div>
    </div>
  );
}
