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
      ai_settings: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string
          model: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          model?: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          model?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      bot_secrets: {
        Row: {
          antidetect_key: string | null
          bot_id: string
          proxy_password: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          antidetect_key?: string | null
          bot_id: string
          proxy_password?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          antidetect_key?: string | null
          bot_id?: string
          proxy_password?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_secrets_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: true
            referencedRelation: "bots"
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
          antidetect: Json | null
          autopilot: boolean
          behavior: Json | null
          browser_mode: string
          cap_comments: number
          cap_dms: number
          cap_likes: number
          created_at: string
          fb_profile_name: string | null
          fingerprint: Json | null
          id: string
          jitter_minutes: number
          last_seen_at: string | null
          manual_mode: boolean
          manual_reason: string | null
          manual_since: string | null
          name: string
          notes: string | null
          offer_link: string | null
          offer_step: number
          offer_text: string | null
          paused: boolean
          persona_role: string
          profile_url: string | null
          proxy: string | null
          proxy_check: Json | null
          proxy_checked_at: string | null
          proxy_country: string | null
          proxy_host: string | null
          proxy_port: number | null
          proxy_protocol: string
          proxy_rotate_url: string | null
          proxy_type: string
          proxy_user: string | null
          require_approval: boolean
          session_status: string
          session_updated_at: string | null
          simulate: boolean
          status: string
          text_mode: string
          timezone: string
          tone: string | null
          typo_rate: number
          unlock_note: string | null
          unlock_requested_at: string | null
          unlock_state: string
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
          antidetect?: Json | null
          autopilot?: boolean
          behavior?: Json | null
          browser_mode?: string
          cap_comments?: number
          cap_dms?: number
          cap_likes?: number
          created_at?: string
          fb_profile_name?: string | null
          fingerprint?: Json | null
          id?: string
          jitter_minutes?: number
          last_seen_at?: string | null
          manual_mode?: boolean
          manual_reason?: string | null
          manual_since?: string | null
          name: string
          notes?: string | null
          offer_link?: string | null
          offer_step?: number
          offer_text?: string | null
          paused?: boolean
          persona_role?: string
          profile_url?: string | null
          proxy?: string | null
          proxy_check?: Json | null
          proxy_checked_at?: string | null
          proxy_country?: string | null
          proxy_host?: string | null
          proxy_port?: number | null
          proxy_protocol?: string
          proxy_rotate_url?: string | null
          proxy_type?: string
          proxy_user?: string | null
          require_approval?: boolean
          session_status?: string
          session_updated_at?: string | null
          simulate?: boolean
          status?: string
          text_mode?: string
          timezone?: string
          tone?: string | null
          typo_rate?: number
          unlock_note?: string | null
          unlock_requested_at?: string | null
          unlock_state?: string
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
          antidetect?: Json | null
          autopilot?: boolean
          behavior?: Json | null
          browser_mode?: string
          cap_comments?: number
          cap_dms?: number
          cap_likes?: number
          created_at?: string
          fb_profile_name?: string | null
          fingerprint?: Json | null
          id?: string
          jitter_minutes?: number
          last_seen_at?: string | null
          manual_mode?: boolean
          manual_reason?: string | null
          manual_since?: string | null
          name?: string
          notes?: string | null
          offer_link?: string | null
          offer_step?: number
          offer_text?: string | null
          paused?: boolean
          persona_role?: string
          profile_url?: string | null
          proxy?: string | null
          proxy_check?: Json | null
          proxy_checked_at?: string | null
          proxy_country?: string | null
          proxy_host?: string | null
          proxy_port?: number | null
          proxy_protocol?: string
          proxy_rotate_url?: string | null
          proxy_type?: string
          proxy_user?: string | null
          require_approval?: boolean
          session_status?: string
          session_updated_at?: string | null
          simulate?: boolean
          status?: string
          text_mode?: string
          timezone?: string
          tone?: string | null
          typo_rate?: number
          unlock_note?: string | null
          unlock_requested_at?: string | null
          unlock_state?: string
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
      contact_events: {
        Row: {
          body: string | null
          bot_id: string | null
          created_at: string
          direction: string
          group_id: string | null
          id: string
          job_id: string | null
          kind: string
          meta: Json
          recipient_id: string
          user_id: string
        }
        Insert: {
          body?: string | null
          bot_id?: string | null
          created_at?: string
          direction?: string
          group_id?: string | null
          id?: string
          job_id?: string | null
          kind: string
          meta?: Json
          recipient_id: string
          user_id?: string
        }
        Update: {
          body?: string | null
          bot_id?: string | null
          created_at?: string
          direction?: string
          group_id?: string | null
          id?: string
          job_id?: string | null
          kind?: string
          meta?: Json
          recipient_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_events_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "recipients"
            referencedColumns: ["id"]
          },
        ]
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
          generated_text: string | null
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
          generated_text?: string | null
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
          generated_text?: string | null
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
      notifications: {
        Row: {
          body: string | null
          bot_id: string | null
          created_at: string
          id: string
          level: string
          meta: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          bot_id?: string | null
          created_at?: string
          id?: string
          level?: string
          meta?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          bot_id?: string | null
          created_at?: string
          id?: string
          level?: string
          meta?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      recipients: {
        Row: {
          blacklisted: boolean
          bot_id: string | null
          context_updated_at: string | null
          created_at: string
          fb_user_id: string | null
          first_name: string | null
          group_id: string | null
          id: string
          last_contacted_at: string | null
          last_context: string | null
          name: string | null
          name_source: string | null
          offer_sent_at: string | null
          profile_url: string | null
          raw_event: Json
          replied_at: string | null
          reply_count: number
          score: number
          source: string
          stage: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blacklisted?: boolean
          bot_id?: string | null
          context_updated_at?: string | null
          created_at?: string
          fb_user_id?: string | null
          first_name?: string | null
          group_id?: string | null
          id?: string
          last_contacted_at?: string | null
          last_context?: string | null
          name?: string | null
          name_source?: string | null
          offer_sent_at?: string | null
          profile_url?: string | null
          raw_event?: Json
          replied_at?: string | null
          reply_count?: number
          score?: number
          source?: string
          stage?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          blacklisted?: boolean
          bot_id?: string | null
          context_updated_at?: string | null
          created_at?: string
          fb_user_id?: string | null
          first_name?: string | null
          group_id?: string | null
          id?: string
          last_contacted_at?: string | null
          last_context?: string | null
          name?: string | null
          name_source?: string | null
          offer_sent_at?: string | null
          profile_url?: string | null
          raw_event?: Json
          replied_at?: string | null
          reply_count?: number
          score?: number
          source?: string
          stage?: string
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
