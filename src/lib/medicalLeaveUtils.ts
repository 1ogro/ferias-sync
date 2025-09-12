import { supabase } from "@/integrations/supabase/client";
import { MedicalLeave, TeamCapacityAlert, SpecialApproval } from "./types";

// Helper function to check if user is authenticated
const checkAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Usuário não autenticado');
  }
  return session;
};

// Helper function to map database results to proper types
const mapMedicalLeave = (dbLeave: any): MedicalLeave => ({
  ...dbLeave,
  start_date: new Date(dbLeave.start_date),
  end_date: new Date(dbLeave.end_date),
  created_at: new Date(dbLeave.created_at),
  updated_at: new Date(dbLeave.updated_at)
});

const mapTeamCapacityAlert = (dbAlert: any): TeamCapacityAlert => ({
  ...dbAlert,
  period_start: new Date(dbAlert.period_start),
  period_end: new Date(dbAlert.period_end),
  director_notified_at: dbAlert.director_notified_at ? new Date(dbAlert.director_notified_at) : undefined,
  created_at: new Date(dbAlert.created_at)
});

const mapSpecialApproval = (dbApproval: any): SpecialApproval => ({
  ...dbApproval,
  manager_approval_date: new Date(dbApproval.manager_approval_date),
  director_notification_date: dbApproval.director_notification_date ? new Date(dbApproval.director_notification_date) : undefined,
  created_at: new Date(dbApproval.created_at)
});

// Medical Leave Management
export const createMedicalLeave = async (
  personId: string,
  startDate: Date,
  endDate: Date,
  justification: string,
  createdBy: string,
  affectsTeamCapacity: boolean = true
): Promise<{ success: boolean; data?: MedicalLeave; error?: string }> => {
  try {
    await checkAuth();
    const { data, error } = await supabase
      .from('medical_leaves')
      .insert({
        person_id: personId,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        justification,
        created_by: createdBy,
        affects_team_capacity: affectsTeamCapacity,
        status: 'ATIVA'
      })
      .select()
      .single();

    if (error) throw error;

    // Create team capacity alert if affects capacity
    if (affectsTeamCapacity && data) {
      await createTeamCapacityAlert(personId, startDate, endDate, data.id);
    }

    return { success: true, data: mapMedicalLeave(data) };
  } catch (error: any) {
    console.error('Error creating medical leave:', error);
    return { success: false, error: error.message };
  }
};

export const getActiveMedicalLeaves = async (teamId?: string): Promise<MedicalLeave[]> => {
  try {
    await checkAuth();
    console.log('Fetching active medical leaves...');
    let query = supabase
      .from('medical_leaves')
      .select(`
        *,
        person:people(*)
      `)
      .eq('status', 'ATIVA')
      .gte('end_date', new Date().toISOString().split('T')[0]);

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(mapMedicalLeave);
  } catch (error: any) {
    console.error('Error fetching medical leaves:', error);
    return [];
  }
};

export const getMedicalLeaveConflicts = async (
  teamId: string,
  startDate: Date,
  endDate: Date
): Promise<MedicalLeave[]> => {
  try {
    const { data, error } = await supabase
      .from('medical_leaves')
      .select(`
        *,
        person:people(*)
      `)
      .eq('status', 'ATIVA')
      .eq('affects_team_capacity', true)
      .or(`person.sub_time.eq.${teamId}`)
      .lte('start_date', endDate.toISOString().split('T')[0])
      .gte('end_date', startDate.toISOString().split('T')[0]);

    if (error) throw error;
    return (data || []).map(mapMedicalLeave);
  } catch (error: any) {
    console.error('Error checking medical leave conflicts:', error);
    return [];
  }
};

export const endMedicalLeave = async (
  leaveId: string,
  endDate?: Date
): Promise<{ success: boolean; error?: string }> => {
  try {
    const updateData: any = { status: 'ENCERRADA' };
    if (endDate) {
      updateData.end_date = endDate.toISOString().split('T')[0];
    }

    const { error } = await supabase
      .from('medical_leaves')
      .update(updateData)
      .eq('id', leaveId);

    if (error) throw error;

    // Update related capacity alerts
    await supabase
      .from('team_capacity_alerts')
      .update({ alert_status: 'RESOLVED' })
      .eq('medical_leave_person_id', leaveId);

    return { success: true };
  } catch (error: any) {
    console.error('Error ending medical leave:', error);
    return { success: false, error: error.message };
  }
};

// Team Capacity Alert Management
export const createTeamCapacityAlert = async (
  personId: string,
  startDate: Date,
  endDate: Date,
  medicalLeaveId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await checkAuth();
    // Get person's team
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('sub_time')
      .eq('id', personId)
      .single();

    if (personError) throw personError;
    if (!person?.sub_time) return { success: true }; // No team, no alert needed

    // Count people currently on medical leave in the same team during this period
    const { data: existingLeaves, error: leavesError } = await supabase
      .from('medical_leaves')
      .select(`
        person:people!inner(sub_time)
      `)
      .eq('status', 'ATIVA')
      .eq('affects_team_capacity', true)
      .eq('people.sub_time', person.sub_time)
      .lte('start_date', endDate.toISOString().split('T')[0])
      .gte('end_date', startDate.toISOString().split('T')[0]);

    if (leavesError) throw leavesError;

    const affectedCount = (existingLeaves || []).length + 1; // +1 for the new leave

    const { error } = await supabase
      .from('team_capacity_alerts')
      .insert({
        team_id: person.sub_time,
        period_start: startDate.toISOString().split('T')[0],
        period_end: endDate.toISOString().split('T')[0],
        medical_leave_person_id: medicalLeaveId,
        affected_people_count: affectedCount,
        alert_status: 'ACTIVE'
      });

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error creating team capacity alert:', error);
    return { success: false, error: error.message };
  }
};

export const getTeamCapacityAlerts = async (teamId?: string): Promise<TeamCapacityAlert[]> => {
  try {
    await checkAuth();
    console.log('Fetching team capacity alerts...');
    let query = supabase
      .from('team_capacity_alerts')
      .select('*')
      .eq('alert_status', 'ACTIVE')
      .gte('period_end', new Date().toISOString().split('T')[0])
      .order('created_at', { ascending: false });

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapTeamCapacityAlert);
  } catch (error: any) {
    console.error('Error fetching team capacity alerts:', error);
    return [];
  }
};

// Special Approval Management  
export const createSpecialApproval = async (
  requestId: string,
  medicalLeaveId: string,
  managerId: string,
  justification: string
): Promise<{ success: boolean; data?: SpecialApproval; error?: string }> => {
  try {
    await checkAuth();
    const { data, error } = await supabase
      .from('special_approvals')
      .insert({
        request_id: requestId,
        medical_leave_id: medicalLeaveId,
        manager_id: managerId,
        justification,
        approved_despite_medical_leave: true
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: mapSpecialApproval(data) };
  } catch (error: any) {
    console.error('Error creating special approval:', error);
    return { success: false, error: error.message };
  }
};

export const getSpecialApprovals = async (directorId?: string): Promise<SpecialApproval[]> => {
  try {
    await checkAuth();
    console.log('Fetching special approvals...');
    const { data, error } = await supabase
      .from('special_approvals')
      .select(`
        *,
        request:requests(*),
        medical_leave:medical_leaves(*),
        manager:people!manager_id(*)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapSpecialApproval);
  } catch (error: any) {
    console.error('Error fetching special approvals:', error);
    return [];
  }
};

export const notifyDirectorOfApproval = async (
  approvalId: string,
  directorId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await checkAuth();
    const { error } = await supabase
      .from('special_approvals')
      .update({
        director_id: directorId,
        director_notification_date: new Date().toISOString()
      })
      .eq('id', approvalId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error notifying director:', error);
    return { success: false, error: error.message };
  }
};