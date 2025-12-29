export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          acao: string
          approver_id: string
          comentario: string | null
          created_at: string
          id: string
          level: string
          request_id: string
        }
        Insert: {
          acao: string
          approver_id: string
          comentario?: string | null
          created_at?: string
          id?: string
          level: string
          request_id: string
        }
        Update: {
          acao?: string
          approver_id?: string
          comentario?: string | null
          created_at?: string
          id?: string
          level?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          actor_id: string | null
          created_at: string
          entidade: string
          entidade_id: string
          id: string
          payload: Json | null
        }
        Insert: {
          acao: string
          actor_id?: string | null
          created_at?: string
          entidade: string
          entidade_id: string
          id?: string
          payload?: Json | null
        }
        Update: {
          acao?: string
          actor_id?: string | null
          created_at?: string
          entidade?: string
          entidade_id?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          configured_at: string | null
          configured_by: string | null
          email_enabled: boolean | null
          email_error_message: string | null
          email_from_address: string | null
          email_from_name: string | null
          email_status: string | null
          email_test_date: string | null
          figma_client_id: string | null
          figma_client_secret_set: boolean | null
          figma_enabled: boolean | null
          figma_error_message: string | null
          figma_redirect_uri: string | null
          figma_status: string | null
          figma_test_date: string | null
          id: string
          sheets_auto_sync: boolean | null
          sheets_enabled: boolean | null
          sheets_error_message: string | null
          sheets_id: string | null
          sheets_last_sync: string | null
          sheets_service_account_set: boolean | null
          sheets_status: string | null
          sheets_sync_frequency: string | null
          slack_bot_token_set: boolean | null
          slack_channel_approvals: string | null
          slack_enabled: boolean | null
          slack_error_message: string | null
          slack_status: string | null
          slack_test_date: string | null
          updated_at: string | null
        }
        Insert: {
          configured_at?: string | null
          configured_by?: string | null
          email_enabled?: boolean | null
          email_error_message?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_status?: string | null
          email_test_date?: string | null
          figma_client_id?: string | null
          figma_client_secret_set?: boolean | null
          figma_enabled?: boolean | null
          figma_error_message?: string | null
          figma_redirect_uri?: string | null
          figma_status?: string | null
          figma_test_date?: string | null
          id?: string
          sheets_auto_sync?: boolean | null
          sheets_enabled?: boolean | null
          sheets_error_message?: string | null
          sheets_id?: string | null
          sheets_last_sync?: string | null
          sheets_service_account_set?: boolean | null
          sheets_status?: string | null
          sheets_sync_frequency?: string | null
          slack_bot_token_set?: boolean | null
          slack_channel_approvals?: string | null
          slack_enabled?: boolean | null
          slack_error_message?: string | null
          slack_status?: string | null
          slack_test_date?: string | null
          updated_at?: string | null
        }
        Update: {
          configured_at?: string | null
          configured_by?: string | null
          email_enabled?: boolean | null
          email_error_message?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          email_status?: string | null
          email_test_date?: string | null
          figma_client_id?: string | null
          figma_client_secret_set?: boolean | null
          figma_enabled?: boolean | null
          figma_error_message?: string | null
          figma_redirect_uri?: string | null
          figma_status?: string | null
          figma_test_date?: string | null
          id?: string
          sheets_auto_sync?: boolean | null
          sheets_enabled?: boolean | null
          sheets_error_message?: string | null
          sheets_id?: string | null
          sheets_last_sync?: string | null
          sheets_service_account_set?: boolean | null
          sheets_status?: string | null
          sheets_sync_frequency?: string | null
          slack_bot_token_set?: boolean | null
          slack_channel_approvals?: string | null
          slack_enabled?: boolean | null
          slack_error_message?: string | null
          slack_status?: string | null
          slack_test_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      medical_leaves: {
        Row: {
          affects_team_capacity: boolean
          created_at: string
          created_by: string
          end_date: string
          id: string
          justification: string | null
          person_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          affects_team_capacity?: boolean
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          justification?: string | null
          person_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          affects_team_capacity?: boolean
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          justification?: string | null
          person_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_medical_leaves_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_medical_leaves_person"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_people: {
        Row: {
          cargo: string | null
          created_at: string | null
          created_by: string
          data_contrato: string | null
          data_nascimento: string | null
          director_notes: string | null
          email: string
          gestor_id: string
          id: string
          local: string | null
          modelo_contrato: string | null
          nome: string
          papel: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          sub_time: string | null
        }
        Insert: {
          cargo?: string | null
          created_at?: string | null
          created_by: string
          data_contrato?: string | null
          data_nascimento?: string | null
          director_notes?: string | null
          email: string
          gestor_id: string
          id?: string
          local?: string | null
          modelo_contrato?: string | null
          nome: string
          papel?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          sub_time?: string | null
        }
        Update: {
          cargo?: string | null
          created_at?: string | null
          created_by?: string
          data_contrato?: string | null
          data_nascimento?: string | null
          director_notes?: string | null
          email?: string
          gestor_id?: string
          id?: string
          local?: string | null
          modelo_contrato?: string | null
          nome?: string
          papel?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          sub_time?: string | null
        }
        Relationships: []
      }
      people: {
        Row: {
          ativo: boolean | null
          cargo: string | null
          created_at: string | null
          data_contrato: string | null
          data_nascimento: string | null
          email: string
          gestor_direto_email: string | null
          gestor_id: string | null
          id: string
          is_admin: boolean | null
          local: string | null
          maternity_extension_days: number | null
          modelo_contrato: string | null
          nome: string
          papel: string | null
          sub_time: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          cargo?: string | null
          created_at?: string | null
          data_contrato?: string | null
          data_nascimento?: string | null
          email: string
          gestor_direto_email?: string | null
          gestor_id?: string | null
          id: string
          is_admin?: boolean | null
          local?: string | null
          maternity_extension_days?: number | null
          modelo_contrato?: string | null
          nome: string
          papel?: string | null
          sub_time?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          cargo?: string | null
          created_at?: string | null
          data_contrato?: string | null
          data_nascimento?: string | null
          email?: string
          gestor_direto_email?: string | null
          gestor_id?: string | null
          id?: string
          is_admin?: boolean | null
          local?: string | null
          maternity_extension_days?: number | null
          modelo_contrato?: string | null
          nome?: string
          papel?: string | null
          sub_time?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          person_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          admin_observations: string | null
          conflito_flag: boolean | null
          conflito_refs: string | null
          contract_exception_justification: string | null
          created_at: string
          data_prevista_parto: string | null
          dias_abono: number | null
          fim: string | null
          id: string
          inicio: string | null
          is_contract_exception: boolean | null
          is_historical: boolean
          justificativa: string | null
          original_channel: string | null
          original_created_at: string | null
          portal_rh_solicitado: boolean | null
          requester_id: string
          status: string
          tipo: string
          tipo_ferias: string | null
          updated_at: string
        }
        Insert: {
          admin_observations?: string | null
          conflito_flag?: boolean | null
          conflito_refs?: string | null
          contract_exception_justification?: string | null
          created_at?: string
          data_prevista_parto?: string | null
          dias_abono?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          is_contract_exception?: boolean | null
          is_historical?: boolean
          justificativa?: string | null
          original_channel?: string | null
          original_created_at?: string | null
          portal_rh_solicitado?: boolean | null
          requester_id: string
          status?: string
          tipo: string
          tipo_ferias?: string | null
          updated_at?: string
        }
        Update: {
          admin_observations?: string | null
          conflito_flag?: boolean | null
          conflito_refs?: string | null
          contract_exception_justification?: string | null
          created_at?: string
          data_prevista_parto?: string | null
          dias_abono?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          is_contract_exception?: boolean | null
          is_historical?: boolean
          justificativa?: string | null
          original_channel?: string | null
          original_created_at?: string | null
          portal_rh_solicitado?: boolean | null
          requester_id?: string
          status?: string
          tipo?: string
          tipo_ferias?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      special_approvals: {
        Row: {
          approved_despite_medical_leave: boolean
          created_at: string
          director_id: string | null
          director_notification_date: string | null
          id: string
          justification: string
          manager_approval_date: string
          manager_id: string
          medical_leave_id: string
          request_id: string
        }
        Insert: {
          approved_despite_medical_leave?: boolean
          created_at?: string
          director_id?: string | null
          director_notification_date?: string | null
          id?: string
          justification: string
          manager_approval_date?: string
          manager_id: string
          medical_leave_id: string
          request_id: string
        }
        Update: {
          approved_despite_medical_leave?: boolean
          created_at?: string
          director_id?: string | null
          director_notification_date?: string | null
          id?: string
          justification?: string
          manager_approval_date?: string
          manager_id?: string
          medical_leave_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_special_approvals_director"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_special_approvals_manager"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_special_approvals_medical_leave"
            columns: ["medical_leave_id"]
            isOneToOne: false
            referencedRelation: "medical_leaves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_special_approvals_request"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      team_capacity_alerts: {
        Row: {
          affected_people_count: number
          alert_status: string
          created_at: string
          director_notified_at: string | null
          id: string
          medical_leave_id: string | null
          medical_leave_person_id: string
          period_end: string
          period_start: string
          team_id: string
        }
        Insert: {
          affected_people_count?: number
          alert_status?: string
          created_at?: string
          director_notified_at?: string | null
          id?: string
          medical_leave_id?: string | null
          medical_leave_person_id: string
          period_end: string
          period_start: string
          team_id: string
        }
        Update: {
          affected_people_count?: number
          alert_status?: string
          created_at?: string
          director_notified_at?: string | null
          id?: string
          medical_leave_id?: string | null
          medical_leave_person_id?: string
          period_end?: string
          period_start?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_team_capacity_alerts_medical_leave"
            columns: ["medical_leave_id"]
            isOneToOne: false
            referencedRelation: "medical_leaves"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacation_balances: {
        Row: {
          accrued_days: number
          balance_days: number
          contract_anniversary: string | null
          created_at: string
          id: string
          manual_justification: string | null
          person_id: string
          updated_at: string
          updated_by: string | null
          used_days: number
          year: number
        }
        Insert: {
          accrued_days?: number
          balance_days?: number
          contract_anniversary?: string | null
          created_at?: string
          id?: string
          manual_justification?: string | null
          person_id: string
          updated_at?: string
          updated_by?: string | null
          used_days?: number
          year: number
        }
        Update: {
          accrued_days?: number
          balance_days?: number
          contract_anniversary?: string | null
          created_at?: string
          id?: string
          manual_justification?: string | null
          person_id?: string
          updated_at?: string
          updated_by?: string | null
          used_days?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_pending_person: {
        Args: {
          p_cargo?: string
          p_data_contrato?: string
          p_data_nascimento?: string
          p_director_notes?: string
          p_email?: string
          p_gestor_id?: string
          p_local?: string
          p_modelo_contrato?: string
          p_nome?: string
          p_pending_id: string
          p_reviewer_id: string
          p_sub_time?: string
        }
        Returns: Json
      }
      get_active_people_for_signup: {
        Args: never
        Returns: {
          email: string
          id: string
          nome: string
        }[]
      }
      get_vacation_summary: {
        Args: { p_year?: number }
        Returns: {
          accumulated_vacations: number
          average_balance: number
          total_people: number
          without_contract: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_current_user_admin: { Args: never; Returns: boolean }
      recalculate_vacation_balance: {
        Args: { p_person_id: string; p_year?: number }
        Returns: {
          accrued_days: number
          balance_days: number
          contract_anniversary: string
          person_id: string
          used_days: number
          year: number
        }[]
      }
      reject_pending_person: {
        Args: {
          p_pending_id: string
          p_rejection_reason: string
          p_reviewer_id: string
        }
        Returns: Json
      }
      set_contract_data_for_current_user: {
        Args: { p_date: string; p_model: string }
        Returns: undefined
      }
      update_profile_for_current_user: {
        Args: { p_data_nascimento: string; p_email: string; p_nome: string }
        Returns: undefined
      }
      validate_maternity_leave: {
        Args: { p_person_id: string; p_start_date: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "director" | "manager" | "user"
      status:
        | "PENDENTE"
        | "EM_ANALISE_GESTOR"
        | "APROVADO_1NIVEL"
        | "EM_ANALISE_DIRETOR"
        | "APROVADO_FINAL"
        | "REPROVADO"
        | "CANCELADO"
        | "REALIZADO"
        | "EM_ANDAMENTO"
      TipoAusencia:
        | "DAYOFF"
        | "FERIAS"
        | "LICENCA_MEDICA"
        | "LICENCA_MATERNIDADE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "director", "manager", "user"],
      status: [
        "PENDENTE",
        "EM_ANALISE_GESTOR",
        "APROVADO_1NIVEL",
        "EM_ANALISE_DIRETOR",
        "APROVADO_FINAL",
        "REPROVADO",
        "CANCELADO",
        "REALIZADO",
        "EM_ANDAMENTO",
      ],
      TipoAusencia: [
        "DAYOFF",
        "FERIAS",
        "LICENCA_MEDICA",
        "LICENCA_MATERNIDADE",
      ],
    },
  },
} as const
