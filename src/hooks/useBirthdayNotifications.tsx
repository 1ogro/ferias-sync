import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Person, Papel } from "@/lib/types";
import { isBirthdayToday } from "@/lib/dateUtils";
import { Cake } from "lucide-react";

export const useBirthdayNotifications = () => {
  const { toast } = useToast();
  const { person } = useAuth();
  const [hasCheckedToday, setHasCheckedToday] = useState(false);

  useEffect(() => {
    // Only check for managers and directors
    if (!person || ![Papel.GESTOR, Papel.DIRETOR].includes(person.papel)) {
      return;
    }

    // Check if we already showed notification today
    const today = new Date().toDateString();
    const lastCheck = localStorage.getItem('birthday-check-date');
    
    if (lastCheck === today) {
      setHasCheckedToday(true);
      return;
    }

    checkTeamBirthdays();
  }, [person]);

  const checkTeamBirthdays = async () => {
    if (!person) return;

    try {
      // For directors, get all people; for managers, get their direct reports
      let query = supabase.from('people').select('*');
      
      if (person.papel === Papel.GESTOR) {
        query = query.eq('gestor_id', person.id);
      }
      
      const { data: teamMembers } = await query;

      if (teamMembers) {
        const birthdayPeople = teamMembers
          .map((member: any): Person => ({
            ...member,
            papel: member.papel as Papel,
            organizational_role: member.organizational_role
          }))
          .filter((member: Person) => 
            member.data_nascimento && 
            member.ativo && 
            member.id !== person.id && // Don't include self
            isBirthdayToday(member.data_nascimento)
          );

        if (birthdayPeople.length > 0) {
          showBirthdayNotification(birthdayPeople);
        }
      }

      // Mark as checked for today
      localStorage.setItem('birthday-check-date', new Date().toDateString());
      setHasCheckedToday(true);
      
    } catch (error) {
      console.error('Error checking team birthdays:', error);
    }
  };

  const showBirthdayNotification = (birthdayPeople: Person[]) => {
    const names = birthdayPeople.map(p => p.nome.split(' ')[0]).join(', ');
    const isMultiple = birthdayPeople.length > 1;
    
    toast({
      title: "🎉 Aniversário na equipe!",
      description: `${isMultiple ? 'Hoje fazem' : 'Hoje faz'} aniversário: ${names}. ${isMultiple ? 'Eles têm' : 'Ele/ela tem'} direito ao day-off especial!`,
      duration: 10000, // Show for 10 seconds
      action: (
        <div className="flex items-center gap-1 text-primary">
          <Cake className="w-4 h-4" />
          <span className="text-xs">Parabéns!</span>
        </div>
      ),
    });
  };

  return { hasCheckedToday };
};