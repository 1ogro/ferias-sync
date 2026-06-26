import { Link, useParams, Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ClipboardCheck,
  Inbox,
  Users,
  Shield,
  Sparkles,
  UserPlus,
  Settings,
  ArrowRight,
  PartyPopper,
  CheckCircle2,
  LifeBuoy,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Step = {
  num: number;
  title: string;
  body: string;
  ctaLabel: string;
  ctaTo: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Tip = { title: string; body: string };

type Variant = {
  audience: "colaborador" | "gestor";
  kicker: string;
  title: string;
  subtitle: string;
  steps: Step[];
  tips: Tip[];
  related: { label: string; to: string; icon: React.ComponentType<{ className?: string }> }[];
};

const variants: Record<"colaborador" | "gestor", Variant> = {
  colaborador: {
    audience: "colaborador",
    kicker: "Onboarding · Colaborador",
    title: "Bem-vindo ao Férias UXTD",
    subtitle:
      "Plataforma única para solicitar e acompanhar suas ausências — férias, day-off, licença médica e maternidade — com validação automática de saldo e regras do seu contrato.",
    steps: [
      {
        num: 1,
        title: "Confira seu perfil",
        body:
          "Garanta que data de nascimento, cargo, time e dados de contrato estão corretos. O day-off é liberado no 1º dia do mês do seu aniversário.",
        ctaLabel: "Abrir meu perfil",
        ctaTo: "/settings",
        icon: ClipboardCheck,
      },
      {
        num: 2,
        title: "Solicite uma ausência",
        body:
          "Escolha o tipo (férias, day-off, licença), datas e justificativa. O fluxo segue automaticamente para o seu gestor — e para o diretor quando a regra exigir.",
        ctaLabel: "Nova solicitação",
        ctaTo: "/new-request",
        icon: Calendar,
      },
      {
        num: 3,
        title: "Acompanhe saldo e status",
        body:
          "No dashboard você vê saldo de férias, day-off, histórico e status em tempo real de cada pedido.",
        ctaLabel: "Ir para o dashboard",
        ctaTo: "/",
        icon: Sparkles,
      },
    ],
    tips: [
      {
        title: "Férias CLT",
        body: "Após aprovação aqui, registre também no Portal RH para efetivar o pagamento.",
      },
      {
        title: "Day-off",
        body: "É anual e deve ser usado dentro do mês do seu aniversário.",
      },
      {
        title: "Notificações",
        body: "Receba avisos por Slack e email. Ajuste preferências em Configurações.",
      },
    ],
    related: [
      { label: "Configurações", to: "/settings", icon: Settings },
      { label: "Engajamento", to: "/engagement", icon: Sparkles },
    ],
  },
  gestor: {
    audience: "gestor",
    kicker: "Onboarding · Gestor",
    title: "Guia rápido para Gestores",
    subtitle:
      "Você é o primeiro nível de aprovação. Estes são os fluxos do dia a dia para manter o time coberto e as ausências em ordem.",
    steps: [
      {
        num: 1,
        title: "Aprovar solicitações pendentes",
        body:
          "A Caixa de Entrada mostra todos os pedidos do seu time aguardando análise. Aprove, peça mais informações ou recuse com justificativa.",
        ctaLabel: "Abrir Caixa de Entrada",
        ctaTo: "/inbox",
        icon: Inbox,
      },
      {
        num: 2,
        title: "Acompanhar capacidade do time",
        body:
          "Veja sobreposição de ausências, licenças médicas e impacto na cobertura. Consulte antes de aprovar férias longas.",
        ctaLabel: "Ver Gestão do Time",
        ctaTo: "/vacation-management",
        icon: Users,
      },
      {
        num: 3,
        title: "Cadastrar novos colaboradores",
        body:
          "Envie cadastros ou aprove os que vêm via /biscoito no Slack. Após aprovar, o sistema notifica o colaborador (Slack DM + email) e o leva ao wizard de perfil.",
        ctaLabel: "Cadastros pendentes",
        ctaTo: "/inbox",
        icon: UserPlus,
      },
    ],
    tips: [
      {
        title: "Tempo de resposta",
        body: "Responda solicitações em até 48h para não travar o planejamento do time.",
      },
      {
        title: "Observações",
        body: "Use o campo de observações para registrar acordos e contexto da decisão.",
      },
      {
        title: "Licença médica",
        body: "Quando afetar mais de 30% do time, o diretor é notificado automaticamente.",
      },
    ],
    related: [
      { label: "Dashboard", to: "/", icon: Calendar },
      { label: "Administração", to: "/admin", icon: Shield },
      { label: "Configurações", to: "/settings", icon: Settings },
    ],
  },
};

export default function Onboarding() {
  const { audience } = useParams<{ audience: string }>();
  const { person } = useAuth();

  if (audience !== "colaborador" && audience !== "gestor") {
    const fallback =
      person?.papel === "GESTOR" || person?.papel === "DIRETOR" ? "gestor" : "colaborador";
    return <Navigate to={`/onboarding/${fallback}`} replace />;
  }

  const v = variants[audience];
  const otherAudience = audience === "colaborador" ? "gestor" : "colaborador";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero */}
        <section className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary" className="uppercase tracking-wider text-xs">
              {v.kicker}
            </Badge>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/onboarding/${otherAudience}`}>
                Ver guia de {otherAudience === "gestor" ? "gestores" : "colaboradores"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-4 flex items-start gap-4">
            <div className="hidden sm:flex h-12 w-12 rounded-full bg-primary/15 items-center justify-center shrink-0">
              <PartyPopper className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{v.title}</h1>
              <p className="text-muted-foreground mt-2 max-w-3xl">{v.subtitle}</p>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {v.audience === "colaborador" ? "Primeiros passos" : "Responsabilidades"}
          </h2>
          <div className="grid gap-4">
            {v.steps.map((step) => {
              const Icon = step.icon;
              return (
                <Card key={step.num} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                        {step.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {step.title}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pl-[4.5rem] pt-0 space-y-3">
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                    <Button asChild size="sm">
                      <Link to={step.ctaTo}>
                        {step.ctaLabel}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Tips */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {v.audience === "colaborador" ? "Lembretes rápidos" : "Boas práticas"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {v.tips.map((tip) => (
              <div
                key={tip.title}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">{tip.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{tip.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Related shortcuts */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Atalhos úteis
          </h2>
          <div className="flex flex-wrap gap-2">
            {v.related.map((r) => {
              const Icon = r.icon;
              return (
                <Button key={r.to} variant="outline" size="sm" asChild>
                  <Link to={r.to}>
                    <Icon className="mr-2 h-4 w-4" />
                    {r.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </section>

        {/* Help */}
        <section className="rounded-lg border border-dashed border-border bg-muted/30 p-5 flex items-start gap-3">
          <LifeBuoy className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {v.audience === "colaborador" ? (
              <>Dúvidas? Fale com seu gestor ou use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/biscoito</code> no Slack para enviar um reconhecimento ou cadastro.</>
            ) : (
              <>Dúvidas sobre regras ou exceções? Acione o time de Administração ou abra um chamado no canal #ferias-uxtd no Slack.</>
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
