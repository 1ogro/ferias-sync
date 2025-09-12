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
          conflito_flag: boolean | null
          conflito_refs: string | null
          created_at: string
          fim: string | null
          id: string
          inicio: string | null
          justificativa: string | null
          requester_id: string
          status: string
          tipo: string
          tipo_ferias: string | null
          updated_at: string
        }
        Insert: {
          conflito_flag?: boolean | null
          conflito_refs?: string | null
          created_at?: string
          fim?: string | null
          id?: string
          inicio?: string | null
          justificativa?: string | null
          requester_id: string
          status?: string
          tipo: string
          tipo_ferias?: string | null
          updated_at?: string
        }
        Update: {
          conflito_flag?: boolean | null
          conflito_refs?: string | null
          created_at?: string
          fim?: string | null
          id?: string
          inicio?: string | null
          justificativa?: string | null
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
      vacation_balances: {
        Row: {
          accrued_days: number
          balance_days: number
          contract_anniversary: string | null
          created_at: string
          id: string
          person_id: string
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          accrued_days?: number
          balance_days?: number
          contract_anniversary?: string | null
          created_at?: string
          id?: string
          person_id: string
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          accrued_days?: number
          balance_days?: number
          contract_anniversary?: string | null
          created_at?: string
          id?: string
          person_id?: string
          updated_at?: string
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
      is_current_user_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
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
    },
  },
} as const
