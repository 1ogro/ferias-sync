import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Trophy, MessageCircleHeart, ArrowRight, Sunrise, Sunset } from "lucide-react";
import { usePulseCheckinAverages } from "@/hooks/usePulseCheckinAverages";
import { useLeaderboard } from "@/hooks/useEngagement";
import { useKudosFeed } from "@/hooks/useEngagement";

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function ScoreBlock({
  icon: Icon,
  label,
  weekAvg,
  weekCount,
  monthAvg,
  monthCount,
  loading,
}: {
  icon: typeof Sunrise;
  label: string;
  weekAvg: number | null;
  weekCount: number;
  monthAvg: number | null;
  monthCount: number;
  loading: boolean;
}) {
  return (
    <div className="flex-1 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-16 mt-1" />
      ) : (
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-2xl font-semibold tabular-nums">
            {weekAvg != null ? weekAvg.toFixed(1) : "—"}
          </span>
          <span className="text-xs text-muted-foreground">/ 5</span>
        </div>
      )}
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {weekCount} resposta{weekCount === 1 ? "" : "s"} · esta semana
      </div>
      <div className="text-[10px] text-muted-foreground/80 mt-0.5">
        30d: {monthAvg != null ? monthAvg.toFixed(1) : "—"} · {monthCount} resp.
      </div>
    </div>
  );
}


export function EngagementSummaryCard() {
  const navigate = useNavigate();
  const averages = usePulseCheckinAverages();
  const leaderboard = useLeaderboard("team", "month");
  const kudos = useKudosFeed(1);

  const leader = leaderboard.data?.[0];
  const lastKudo = kudos.data?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Engajamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <ScoreBlock
            icon={Sunrise}
            label="Check-in"
            avg={averages.data?.checkin_avg ?? null}
            count={averages.data?.checkin_count ?? 0}
            loading={averages.isLoading}
          />
          <ScoreBlock
            icon={Sunset}
            label="Check-out"
            avg={averages.data?.checkout_avg ?? null}
            count={averages.data?.checkout_count ?? 0}
            loading={averages.isLoading}
          />
        </div>

        <div className="flex items-center gap-3 p-3 rounded-lg border">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Líder do mês</div>
            {leaderboard.isLoading ? (
              <Skeleton className="h-4 w-32 mt-1" />
            ) : leader ? (
              <div className="text-sm font-medium truncate">
                {leader.nome}
                <span className="text-muted-foreground font-normal ml-2">
                  {leader.total_points} pts
                </span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Sem pontuação ainda</div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircleHeart className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Último kudos</div>
              {lastKudo && (
                <span className="text-[11px] text-muted-foreground">
                  {timeAgo(lastKudo.created_at)}
                </span>
              )}
            </div>
            {kudos.isLoading ? (
              <Skeleton className="h-4 w-40 mt-1" />
            ) : lastKudo ? (
              <>
                <div className="text-sm font-medium truncate">
                  {lastKudo.from?.nome ?? lastKudo.from_slack_name ?? "Alguém"}
                  {" → "}
                  {lastKudo.to?.nome ?? lastKudo.to_slack_name ?? "alguém"}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  "{lastKudo.message}"
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum kudos ainda</div>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate("/vacation-management?tab=pulses")}
        >
          Ver Pulses
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
