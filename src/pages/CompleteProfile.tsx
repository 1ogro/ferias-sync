import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ModeloContrato, MODELO_CONTRATO_LABELS } from "@/lib/types";

export default function CompleteProfile() {
  const { person, fetchPersonData, loading: authLoading, profileChecked } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dataNascimento, setDataNascimento] = useState("");
  const [cargo, setCargo] = useState("");
  const [subTime, setSubTime] = useState("");
  const [local, setLocal] = useState("");
  const [dataContrato, setDataContrato] = useState("");
  const [modeloContrato, setModeloContrato] = useState<ModeloContrato>(ModeloContrato.CLT);
  const [diaPagamento, setDiaPagamento] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!person) return;
    setDataNascimento(person.data_nascimento || "");
    setCargo(person.cargo || "");
    setSubTime(person.subTime || "");
    setLocal(person.local || "");
    setDataContrato(person.data_contrato || "");
    if (person.modelo_contrato) setModeloContrato(person.modelo_contrato);
    if (person.dia_pagamento) setDiaPagamento(person.dia_pagamento);
  }, [person]);

  useEffect(() => {
    if (!authLoading && profileChecked && person && (person as any).profile_completed_at) {
      navigate("/");
    }
  }, [authLoading, profileChecked, person, navigate]);

  const handleSubmit = async () => {
    if (!person) return;
    if (!dataNascimento || !cargo || !subTime || !dataContrato) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos marcados com *.", variant: "destructive" });
      return;
    }
    if (modeloContrato === ModeloContrato.PJ && !diaPagamento) {
      toast({ title: "Dia de pagamento", description: "Selecione o dia de pagamento para contrato PJ.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // 1) Dados pessoais (nome/email mantidos)
      const { error: profErr } = await supabase.rpc("update_profile_for_current_user", {
        p_nome: person.nome,
        p_email: person.email,
        p_data_nascimento: dataNascimento,
      });
      if (profErr) throw profErr;

      // 2) Cargo / time / local — update direto (RLS já permite o próprio usuário via policy de people)
      const { error: personUpdErr } = await supabase
        .from("people")
        .update({
          cargo,
          sub_time: subTime,
          local: local || null,
        })
        .eq("id", person.id);
      if (personUpdErr) throw personUpdErr;

      // 3) Contrato
      const rpcParams: any = { p_date: dataContrato, p_model: modeloContrato };
      if (modeloContrato === ModeloContrato.PJ && diaPagamento) {
        rpcParams.p_dia_pagamento = diaPagamento;
      }
      const { error: contractErr } = await supabase.rpc("set_contract_data_for_current_user", rpcParams);
      if (contractErr) throw contractErr;

      // 4) Marcar perfil como concluído
      const { error: markErr } = await supabase.rpc("mark_profile_completed" as any);
      if (markErr) throw markErr;

      toast({ title: "Tudo certo!", description: "Perfil completo. Bem-vindo(a)!" });
      await fetchPersonData();
      navigate("/");
    } catch (e: any) {
      console.error("[CompleteProfile] error:", e);
      toast({ title: "Erro ao salvar", description: e.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !profileChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!person) {
    navigate("/setup-profile");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Complete seu perfil</CardTitle>
          <CardDescription>
            Bem-vindo(a), {person.nome}! Preencha as informações abaixo para liberar seu acesso ao Férias UXTD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Esses dados são usados para cálculos de férias, day-off e aniversários. Você pode editar depois no seu perfil.
            </AlertDescription>
          </Alert>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Dados pessoais</h3>
            <div className="space-y-2">
              <Label htmlFor="data-nascimento">Data de nascimento *</Label>
              <Input
                id="data-nascimento"
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                disabled={saving}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Cargo e time</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cargo">Cargo *</Label>
                <Input id="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={saving} placeholder="Product Designer" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-time">Time *</Label>
                <Input id="sub-time" value={subTime} onChange={(e) => setSubTime(e.target.value)} disabled={saving} placeholder="Pacientes" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="local">Local</Label>
                <Input id="local" value={local} onChange={(e) => setLocal(e.target.value)} disabled={saving} placeholder="Rio de Janeiro" />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Contrato</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data-contrato">Data de início do contrato *</Label>
                <Input
                  id="data-contrato"
                  type="date"
                  value={dataContrato}
                  onChange={(e) => setDataContrato(e.target.value)}
                  disabled={saving}
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelo">Modelo de contrato *</Label>
                <Select value={modeloContrato} onValueChange={(v: ModeloContrato) => setModeloContrato(v)} disabled={saving}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODELO_CONTRATO_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {modeloContrato === ModeloContrato.PJ && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="dia-pagto">Dia de pagamento *</Label>
                  <Select value={diaPagamento?.toString() || ""} onValueChange={(v) => setDiaPagamento(Number(v))} disabled={saving}>
                    <SelectTrigger><SelectValue placeholder="Selecione o dia" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">Dia 10</SelectItem>
                      <SelectItem value="20">Dia 20</SelectItem>
                      <SelectItem value="30">Dia 30</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          <Button onClick={handleSubmit} disabled={saving} className="w-full">
            {saving ? "Salvando..." : "Concluir e acessar o sistema"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
