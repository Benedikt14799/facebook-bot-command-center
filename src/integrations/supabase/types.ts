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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          bot_id: string | null
          cost_usd: number
          created_at: string
          id: string
          kind: string
          model: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          kind?: string
          model: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Update: {
          bot_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          kind?: string
          model?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_state: {
        Row: {
          created_at: string
          last_error: string | null
          last_run_at: string | null
          paused: boolean
          paused_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_error?: string | null
          last_run_at?: string | null
          paused?: boolean
          paused_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_error?: string | null
          last_run_at?: string | null
          paused?: boolean
          paused_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_groups: {
        Row: {
          bot_id: string
          created_at: string
          group_id: string
          id: string
          join_status: string
          joined_at: string | null
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          group_id: string
          id?: string
          join_status?: string
          joined_at?: string | null
          user_id?: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          group_id?: string
          id?: string
          join_status?: string
          joined_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_groups_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_sessions: {
        Row: {
          bot_id: string
          cookies: Json
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          bot_id: string
          cookies: Json
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          bot_id?: string
          cookies?: Json
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_sessions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: true
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          active_from: string
          active_to: string
          autopilot: boolean
          cap_comments: number
          cap_dms: number
          cap_likes: number
          created_at: string
          fb_profile_name: string | null
          id: string
          jitter_minutes: number
          last_seen_at: string | null
          name: string
          notes: string | null
          paused: boolean
          profile_url: string | null
          proxy: string | null
          require_approval: boolean
          session_status: string
          session_updated_at: string | null
          simulate: boolean
          status: string
          text_mode: string
          timezone: string
          tone: string | null
          updated_at: string
          user_id: string
          warmup_extra_days: number
          warmup_paused: boolean
          warmup_plan: Json
          warmup_preset: string
          warmup_start: string
          warmup_weights: Json
          weekend_factor: number
        }
        Insert: {
          active_from?: string
          active_to?: string
          autopilot?: boolean
          cap_comments?: number
          cap_dms?: number
          cap_likes?: number
          created_at?: string
          fb_profile_name?: string | null
          id?: string
          jitter_minutes?: number
          last_seen_at?: string | null
          name: string
          notes?: string | null
          paused?: boolean
          profile_url?: string | null
          proxy?: string | null
          require_approval?: boolean
          session_status?: string
          session_updated_at?: string | null
          simulate?: boolean
          status?: string
          text_mode?: string
          timezone?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
          warmup_extra_days?: number
          warmup_paused?: boolean
          warmup_plan?: Json
          warmup_preset?: string
          warmup_start?: string
          warmup_weights?: Json
          weekend_factor?: number
        }
        Update: {
          active_from?: string
          active_to?: string
          autopilot?: boolean
          cap_comments?: number
          cap_dms?: number
          cap_likes?: number
          created_at?: string
          fb_profile_name?: string | null
          id?: string
          jitter_minutes?: number
          last_seen_at?: string | null
          name?: string
          notes?: string | null
          paused?: boolean
          profile_url?: string | null
          proxy?: string | null
          require_approval?: boolean
          session_status?: string
          session_updated_at?: string | null
          simulate?: boolean
          status?: string
          text_mode?: string
          timezone?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
          warmup_extra_days?: number
          warmup_paused?: boolean
          warmup_plan?: Json
          warmup_preset?: string
          warmup_start?: string
          warmup_weights?: Json
          weekend_factor?: number
        }
        Relationships: []
      }
      cron_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token?: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          bot_id: string | null
          created_at: string
          id: string
          level: string
          message: string
          meta: Json
          type: string
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          created_at?: string
          id?: string
          level?: string
          message: string
          meta?: Json
          type: string
          user_id?: string
        }
        Update: {
          bot_id?: string | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          meta?: Json
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          active_from: string | null
          active_to: string | null
          allowed_actions: string[]
          cap_comments: number | null
          cap_dms: number | null
          cap_likes: number | null
          cooldown_minutes: number
          created_at: string
          fb_group_id: string | null
          id: string
          language: string | null
          member_count: number | null
          min_score: number
          name: string
          notes: string | null
          status: string
          tone: string | null
          topic: string | null
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          allowed_actions?: string[]
          cap_comments?: number | null
          cap_dms?: number | null
          cap_likes?: number | null
          cooldown_minutes?: number
          created_at?: string
          fb_group_id?: string | null
          id?: string
          language?: string | null
          member_count?: number | null
          min_score?: number
          name: string
          notes?: string | null
          status?: string
          tone?: string | null
          topic?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          allowed_actions?: string[]
          cap_comments?: number | null
          cap_dms?: number | null
          cap_likes?: number | null
          cooldown_minutes?: number
          created_at?: string
          fb_group_id?: string | null
          id?: string
          language?: string | null
          member_count?: number | null
          min_score?: number
          name?: string
          notes?: string | null
          status?: string
          tone?: string | null
          topic?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_locks: {
        Row: {
          created_at: string
          holder: string | null
          locked_until: string
          name: string
        }
        Insert: {
          created_at?: string
          holder?: string | null
          locked_until: string
          name: string
        }
        Update: {
          created_at?: string
          holder?: string | null
          locked_until?: string
          name?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          attempts: number
          bot_id: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          group_id: string | null
          id: string
          needs_approval: boolean
          payload: Json
          recipient_id: string | null
          result: Json | null
          scheduled_for: string
          source: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          bot_id: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          group_id?: string | null
          id?: string
          needs_approval?: boolean
          payload?: Json
          recipient_id?: string | null
          result?: Json | null
          scheduled_for?: string
          source?: string
          status?: string
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          attempts?: number
          bot_id?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          group_id?: string | null
          id?: string
          needs_approval?: boolean
          payload?: Json
          recipient_id?: string | null
          result?: Json | null
          scheduled_for?: string
          source?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          bot_id: string | null
          channel: string
          created_at: string
          direction: string
          external_id: string | null
          group_id: string | null
          id: string
          job_id: string | null
          recipient_id: string | null
          source: string
          thread_ref: string | null
          user_id: string
        }
        Insert: {
          body: string
          bot_id?: string | null
          channel?: string
          created_at?: string
          direction: string
          external_id?: string | null
          group_id?: string | null
          id?: string
          job_id?: string | null
          recipient_id?: string | null
          source?: string
          thread_ref?: string | null
          user_id?: string
        }
        Update: {
          body?: string
          bot_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          group_id?: string | null
          id?: string
          job_id?: string | null
          recipient_id?: string | null
          source?: string
          thread_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      recipients: {
        Row: {
          blacklisted: boolean
          bot_id: string | null
          created_at: string
          fb_user_id: string | null
          group_id: string | null
          id: string
          last_contacted_at: string | null
          name: string | null
          profile_url: string | null
          score: number
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blacklisted?: boolean
          bot_id?: string | null
          created_at?: string
          fb_user_id?: string | null
          group_id?: string | null
          id?: string
          last_contacted_at?: string | null
          name?: string | null
          profile_url?: string | null
          score?: number
          state?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          blacklisted?: boolean
          bot_id?: string | null
          created_at?: string
          fb_user_id?: string | null
          group_id?: string | null
          id?: string
          last_contacted_at?: string | null
          name?: string | null
          profile_url?: string | null
          score?: number
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipients_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          active: boolean
          body: string
          bot_id: string | null
          created_at: string
          group_id: string | null
          id: string
          kind: string
          name: string
          updated_at: string
          user_id: string
          variations: string[]
          weight: number
        }
        Insert: {
          active?: boolean
          body: string
          bot_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          name: string
          updated_at?: string
          user_id?: string
          variations?: string[]
          weight?: number
        }
        Update: {
          active?: boolean
          body?: string
          bot_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
          variations?: string[]
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "templates_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          status: string
          token: string
          user_id: string
          version: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          status?: string
          token?: string
          user_id?: string
          version?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          status?: string
          token?: string
          user_id?: string
          version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
