import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { PulseWeeklyTrendRow } from "@/hooks/usePulses";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Minus, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const ALERT_THRESHOLD = 3.0;

function formatWeek(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface Props {
  data: PulseWeeklyTrendRow[];
  isLoading?: boolean;
  error?: unknown;
}

export function PulseTrendPanel({ data, isLoading, error }: Props) {
  const chartData = useMemo(
    () =>
      data.map((r) => ({
        ...r,
        label: formatWeek(r.week_start),
      })),
    [data]
  );

  const withValue = data.filter((r) => r.avg_value != null);
  const last = withValue[withValue.length - 1];
  const prev = withValue[withValue.length - 2];
  const delta = last && prev && last.avg_value != null && prev.avg_value != null ? last.avg_value - prev.avg_value : null;
  const hiddenWeeks = data.filter((r) => r.avg_value == null && r.response_count > 0).length;

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Não foi possível carregar a evolução semanal.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded border p-3 min-w-[160px]">
          <div className="text-xs text-muted-foreground">Última semana com dados</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-semibold tabular-nums">
              {last?.avg_value != null ? last.avg_value.toFixed(2) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">/ 5</span>
            {delta != null && (
              <span
                className={`text-xs inline-flex items-center gap-0.5 ${
                  delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {delta > 0 ? "+" : ""}
                {delta.toFixed(2)}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {last ? `${last.response_count} resposta${last.response_count === 1 ? "" : "s"} · semana de ${formatWeek(last.week_start)}` : "Sem dados"}
          </div>
        </div>
        {last?.avg_value != null && last.avg_value < ALERT_THRESHOLD && (
          <Badge variant="destructive" className="h-fit">
            Abaixo de {ALERT_THRESHOLD.toFixed(1)} — atenção
          </Badge>
        )}
        {hiddenWeeks > 0 && (
          <Badge variant="outline" className="h-fit">
            {hiddenWeeks} semana{hiddenWeeks === 1 ? "" : "s"} com dados insuficientes (mín. 3 pessoas)
          </Badge>
        )}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: any, _n: any, item: any) => [
                value != null ? `${Number(value).toFixed(2)} / 5` : "Dados insuficientes",
                `${item?.payload?.response_count ?? 0} respostas`,
              ]}
              labelFormatter={(l) => `Semana de ${l}`}
            />
            <ReferenceLine y={ALERT_THRESHOLD} strokeDasharray="4 4" className="stroke-muted-foreground" />
            <Line
              type="monotone"
              dataKey="avg_value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
