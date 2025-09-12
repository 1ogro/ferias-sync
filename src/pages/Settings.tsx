import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSettings } from "@/hooks/useSettings";
import { Monitor, Bell, Table, RotateCcw, Save } from "lucide-react";
import { useState } from "react";

const Settings = () => {
  const { toast } = useToast();
  const { settings, updateSettings, resetSettings } = useSettings();
  const [hasChanges, setHasChanges] = useState(false);

  const handleSettingChange = (key: string, value: any) => {
    updateSettings({ [key]: value });
    setHasChanges(true);
  };

  const handleSave = () => {
    toast({
      title: "Configurações salvas",
      description: "Suas preferências foram salvas com sucesso.",
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    resetSettings();
    toast({
      title: "Configurações restauradas",
      description: "Todas as configurações foram restauradas para o padrão.",
    });
    setHasChanges(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Configurações</h1>
              <p className="text-muted-foreground">
                Personalize sua experiência no sistema de férias
              </p>
            </div>
            <div className="flex gap-2">
              {hasChanges && (
                <Button onClick={handleSave} size="sm">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </Button>
              )}
              <Button variant="outline" onClick={handleReset} size="sm">
                <RotateCcw className="w-4 h-4 mr-2" />
                Restaurar padrões
              </Button>
            </div>
          </div>

          <Tabs defaultValue="appearance" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="appearance">
                <Monitor className="w-4 h-4 mr-2" />
                Aparência
              </TabsTrigger>
              <TabsTrigger value="notifications">
                <Bell className="w-4 h-4 mr-2" />
                Notificações
              </TabsTrigger>
              <TabsTrigger value="display">
                <Table className="w-4 h-4 mr-2" />
                Exibição
              </TabsTrigger>
              <TabsTrigger value="advanced">Avançado</TabsTrigger>
            </TabsList>

            <TabsContent value="appearance">
              <Card>
                <CardHeader>
                  <CardTitle>Aparência</CardTitle>
                  <CardDescription>
                    Personalize o tema e a aparência geral do sistema
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="theme">Tema</Label>
                    <ThemeToggle />
                    <p className="text-sm text-muted-foreground">
                      Escolha entre tema claro, escuro ou automático
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="compact-mode">Modo compacto</Label>
                      <p className="text-sm text-muted-foreground">
                        Reduz o espaçamento entre elementos para mostrar mais conteúdo
                      </p>
                    </div>
                    <Switch
                      id="compact-mode"
                      checked={settings.compactMode}
                      onCheckedChange={(checked) => handleSettingChange('compactMode', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="animations">Animações</Label>
                      <p className="text-sm text-muted-foreground">
                        Habilita transições e animações suaves
                      </p>
                    </div>
                    <Switch
                      id="animations"
                      checked={settings.animations}
                      onCheckedChange={(checked) => handleSettingChange('animations', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications">
              <Card>
                <CardHeader>
                  <CardTitle>Notificações</CardTitle>
                  <CardDescription>
                    Configure quando e como receber notificações do sistema
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="birthday-notifications">Notificações de aniversário</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba alertas sobre aniversários da equipe
                      </p>
                    </div>
                    <Switch
                      id="birthday-notifications"
                      checked={settings.birthdayNotifications}
                      onCheckedChange={(checked) => handleSettingChange('birthdayNotifications', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="request-reminders">Lembretes de solicitações</Label>
                      <p className="text-sm text-muted-foreground">
                        Notificações sobre solicitações pendentes
                      </p>
                    </div>
                    <Switch
                      id="request-reminders"
                      checked={settings.requestReminders}
                      onCheckedChange={(checked) => handleSettingChange('requestReminders', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="system-alerts">Alertas do sistema</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba notificações sobre atualizações importantes
                      </p>
                    </div>
                    <Switch
                      id="system-alerts"
                      checked={settings.systemAlerts}
                      onCheckedChange={(checked) => handleSettingChange('systemAlerts', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="display">
              <Card>
                <CardHeader>
                  <CardTitle>Exibição</CardTitle>
                  <CardDescription>
                    Configure como as informações são exibidas nas tabelas e listas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="items-per-page">Itens por página</Label>
                    <Select
                      value={settings.itemsPerPage.toString()}
                      onValueChange={(value) => handleSettingChange('itemsPerPage', parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 itens</SelectItem>
                        <SelectItem value="10">10 itens</SelectItem>
                        <SelectItem value="20">20 itens</SelectItem>
                        <SelectItem value="50">50 itens</SelectItem>
                        <SelectItem value="100">100 itens</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Número de itens exibidos por página nas tabelas
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Formato de data</Label>
                    <Select
                      value={settings.dateFormat}
                      onValueChange={(value) => handleSettingChange('dateFormat', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dd/MM/yyyy">DD/MM/AAAA</SelectItem>
                        <SelectItem value="MM/dd/yyyy">MM/DD/AAAA</SelectItem>
                        <SelectItem value="yyyy-MM-dd">AAAA-MM-DD</SelectItem>
                        <SelectItem value="dd-MM-yyyy">DD-MM-AAAA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="show-tooltips">Dicas de ferramentas</Label>
                      <p className="text-sm text-muted-foreground">
                        Exibe informações adicionais ao passar o mouse sobre elementos
                      </p>
                    </div>
                    <Switch
                      id="show-tooltips"
                      checked={settings.showTooltips}
                      onCheckedChange={(checked) => handleSettingChange('showTooltips', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced">
              <Card>
                <CardHeader>
                  <CardTitle>Configurações avançadas</CardTitle>
                  <CardDescription>
                    Configurações técnicas e de desenvolvimento
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="debug-mode">Modo de debug</Label>
                      <p className="text-sm text-muted-foreground">
                        Ativa informações técnicas adicionais
                        <Badge variant="outline" className="ml-2">Desenvolvimento</Badge>
                      </p>
                    </div>
                    <Switch
                      id="debug-mode"
                      checked={settings.debugMode}
                      onCheckedChange={(checked) => handleSettingChange('debugMode', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-save">Salvamento automático</Label>
                      <p className="text-sm text-muted-foreground">
                        Salva automaticamente rascunhos de solicitações
                      </p>
                    </div>
                    <Switch
                      id="auto-save"
                      checked={settings.autoSave}
                      onCheckedChange={(checked) => handleSettingChange('autoSave', checked)}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label>Cache do aplicativo</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        Limpar cache
                      </Button>
                      <Button variant="outline" size="sm">
                        Recarregar dados
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Limpe o cache se estiver enfrentando problemas de carregamento
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Settings;