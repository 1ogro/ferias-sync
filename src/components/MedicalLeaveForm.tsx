import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { createMedicalLeave } from "@/lib/medicalLeaveUtils";
import { useAuth } from "@/hooks/useAuth";
import { Person } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface MedicalLeaveFormProps {
  people: Person[];
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  person_id: string;
  start_date: Date | undefined;
  end_date: Date | undefined;
  justification: string;
  affects_team_capacity: boolean;
}

export const MedicalLeaveForm = ({ people, onSuccess, onCancel }: MedicalLeaveFormProps) => {
  const { person } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      affects_team_capacity: true,
    },
  });

  const startDate = watch("start_date");
  const endDate = watch("end_date");
  const affectsCapacity = watch("affects_team_capacity");

  const onSubmit = async (data: FormData) => {
    if (!data.start_date || !data.end_date) {
      toast({
        title: "Erro",
        description: "Por favor, selecione as datas de início e fim.",
        variant: "destructive",
      });
      return;
    }

    if (!person?.id) {
      toast({
        title: "Erro",
        description: "Usuário não identificado.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await createMedicalLeave(
        data.person_id,
        data.start_date,
        data.end_date,
        data.justification,
        person.id,
        data.affects_team_capacity
      );

      if (result.success) {
        toast({
          title: "Sucesso",
          description: "Licença médica registrada com sucesso.",
        });
        onSuccess();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao registrar licença médica.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Registrar Licença Médica</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="person_id">Funcionário</Label>
            <Select onValueChange={(value) => setValue("person_id", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o funcionário" />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.nome} - {person.cargo} ({person.subTime})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.person_id && (
              <p className="text-sm text-destructive">Campo obrigatório</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => setValue("start_date", date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {errors.start_date && (
                <p className="text-sm text-destructive">Campo obrigatório</p>
              )}
            </div>

            <div>
              <Label>Data de Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => setValue("end_date", date)}
                    initialFocus
                    disabled={(date) => startDate ? date < startDate : false}
                  />
                </PopoverContent>
              </Popover>
              {errors.end_date && (
                <p className="text-sm text-destructive">Campo obrigatório</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="justification">Justificativa</Label>
            <Textarea
              {...register("justification", { required: "Campo obrigatório" })}
              placeholder="Motivo da licença médica..."
              rows={3}
            />
            {errors.justification && (
              <p className="text-sm text-destructive">{errors.justification.message}</p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={affectsCapacity}
              onCheckedChange={(checked) => setValue("affects_team_capacity", checked)}
              id="affects_capacity"
            />
            <Label htmlFor="affects_capacity">
              Afeta capacidade do time (bloqueia novas solicitações)
            </Label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrar Licença"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};