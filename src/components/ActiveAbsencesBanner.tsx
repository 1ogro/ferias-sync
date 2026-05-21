import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Briefcase, Baby, Activity, Clock } from "lucide-react";
import { parseDateSafely } from "@/lib/dateUtils";
import { differenceInDays, format } from "date-fns";

interface ActiveAbsence {
  id: string;
  requester_id: string;
  nome: string;
  tipo: string;
  inicio: string;
  fim: string;
  dias_restantes: number;
}

interface Props {
  teamIds?: string[]; // if provided, filter to these requester ids (gestor view)
  onSeeDetails?: () => void;
}

const typeMeta = (tipo: string) => {
  switch (tipo) {
    case "LICENCA_MATERNIDADE":
      return { label: "Lic. Maternidade", icon: Baby };
    case "LICENCA_MEDICA":
      return { label: "Lic. Médica", icon: Activity };
    case "DAYOFF":
      return { label: "Day Off", icon: Clock };
    default:
      return { label: "Férias", icon: Briefcase };
  }
};

export function ActiveAbsencesBanner({ teamIds, onSeeDetails }: Props) {
  const [absences, setAbsences] = useState<ActiveAbsence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().split("T")[0];
        const { data, error } = await supabase
          .from("requests")
          .select(`id, requester_id, inicio, fim, tipo, people!requests_requester_id_fkey(nome)`)
          .in("status", ["APROVADO_FINAL", "REALIZADO"])
          .in("tipo", ["FERIAS", "LICENCA_MATERNIDADE", "LICENCA_MEDICA", "DAYOFF"])
          .lte("inicio", today)
          .gte("fim", today)
          .order("fim", { ascending: true });

        if (error) throw error;

        const mapped: ActiveAbsence[] = (data || []).map((r: any) => ({
          id: r.id,
          requester_id: r.requester_id,
          nome: r.people?.nome || "Colaborador",
          tipo: r.tipo,
          inicio: r.inicio,
          fim: r.fim,
          dias_restantes: differenceInDays(parseDateSafely(r.fim), new Date()),
        }));

        const filtered = teamIds ? mapped.filter((a) => teamIds.includes(a.requester_id)) : mapped;
        setAbsences(filtered);
      } catch (err) {
        console.error("Erro ao carregar banner de ausências:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [teamIds?.join(",")]);

  if (loading || absences.length === 0) return null;

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              {absences.length} pessoa{absences.length > 1 ? "s" : ""} ausente{absences.length > 1 ? "s" : ""} hoje
            </div>
            <div className="flex flex-wrap gap-2">
              {absences.map((a) => {
                const { label, icon: Icon } = typeMeta(a.tipo);
                return (
                  <Badge
                    key={a.id}
                    variant="outline"
                    className="bg-background gap-1 font-normal"
                    title={`${format(parseDateSafely(a.inicio), "dd/MM/yyyy")} - ${format(parseDateSafely(a.fim), "dd/MM/yyyy")}`}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="font-medium">{a.nome}</span>
                    <span className="text-muted-foreground">· {label}</span>
                    <span className="text-muted-foreground">
                      · retorna em {a.dias_restantes} dia{a.dias_restantes !== 1 ? "s" : ""}
                    </span>
                  </Badge>
                );
              })}
            </div>
          </div>
          {onSeeDetails && (
            <Button size="sm" variant="outline" onClick={onSeeDetails} className="shrink-0">
              Ver detalhes
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
