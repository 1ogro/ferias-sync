import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface NotificationPreferences {
  birthday_email: boolean;
  birthday_slack: boolean;
  request_updates_email: boolean;
  request_updates_slack: boolean;
  system_alerts_email: boolean;
  system_alerts_slack: boolean;
  admin_actions_email: boolean;
  admin_actions_slack: boolean;
}

const defaultPreferences: NotificationPreferences = {
  birthday_email: true,
  birthday_slack: false,
  request_updates_email: true,
  request_updates_slack: true,
  system_alerts_email: true,
  system_alerts_slack: false,
  admin_actions_email: true,
  admin_actions_slack: true,
};

export function useNotificationPreferences() {
  const { person } = useAuth();
  const personId = person?.id;
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPreferences = useCallback(async () => {
    if (!personId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("person_id", personId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching notification preferences:", error);
        return;
      }

      if (data) {
        setPreferences({
          birthday_email: data.birthday_email,
          birthday_slack: data.birthday_slack,
          request_updates_email: data.request_updates_email,
          request_updates_slack: data.request_updates_slack,
          system_alerts_email: data.system_alerts_email,
          system_alerts_slack: data.system_alerts_slack,
          admin_actions_email: data.admin_actions_email,
          admin_actions_slack: data.admin_actions_slack,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!personId) return;
    
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          {
            person_id: personId,
            ...newPreferences,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "person_id" }
        );

      if (error) {
        console.error("Error saving notification preferences:", error);
        // Revert on error
        setPreferences(preferences);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return { preferences, isLoading, isSaving, updatePreference };
}
