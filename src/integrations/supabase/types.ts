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
      agency_applications: {
        Row: {
          admin_notes: string | null
          agency_name: string
          agency_website: string
          country: string
          created_at: string
          email: string
          full_name: string
          id: string
          incorporation_document_url: string
          reviewed_at: string | null
          status: string
          updated_at: string
          user_id: string
          whatsapp_phone: string
        }
        Insert: {
          admin_notes?: string | null
          agency_name: string
          agency_website: string
          country: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          incorporation_document_url: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_phone: string
        }
        Update: {
          admin_notes?: string | null
          agency_name?: string
          agency_website?: string
          country?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          incorporation_document_url?: string
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_phone?: string
        }
        Relationships: []
      }
      agency_payouts: {
        Row: {
          agency_name: string
          commission_percentage: number
          created_at: string
          email: string | null
          id: string
          invite_sent_at: string | null
          last_login_at: string | null
          onboarding_complete: boolean
          password_hash: string | null
          stripe_account_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agency_name: string
          commission_percentage?: number
          created_at?: string
          email?: string | null
          id?: string
          invite_sent_at?: string | null
          last_login_at?: string | null
          onboarding_complete?: boolean
          password_hash?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agency_name?: string
          commission_percentage?: number
          created_at?: string
          email?: string | null
          id?: string
          invite_sent_at?: string | null
          last_login_at?: string | null
          onboarding_complete?: boolean
          password_hash?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      articles: {
        Row: {
          categories: number[] | null
          content: string
          created_at: string
          featured_image: Json | null
          id: string
          published_to: string | null
          source_headline: Json | null
          status: string
          tag_ids: number[] | null
          tags: string[] | null
          title: string
          tone: string
          updated_at: string
          user_id: string
          wp_featured_media_id: number | null
          wp_link: string | null
          wp_post_id: number | null
        }
        Insert: {
          categories?: number[] | null
          content: string
          created_at?: string
          featured_image?: Json | null
          id?: string
          published_to?: string | null
          source_headline?: Json | null
          status?: string
          tag_ids?: number[] | null
          tags?: string[] | null
          title: string
          tone?: string
          updated_at?: string
          user_id: string
          wp_featured_media_id?: number | null
          wp_link?: string | null
          wp_post_id?: number | null
        }
        Update: {
          categories?: number[] | null
          content?: string
          created_at?: string
          featured_image?: Json | null
          id?: string
          published_to?: string | null
          source_headline?: Json | null
          status?: string
          tag_ids?: number[] | null
          tags?: string[] | null
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
          wp_featured_media_id?: number | null
          wp_link?: string | null
          wp_post_id?: number | null
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          active: boolean
          created_at: string
          credits: number
          id: string
          name: string
          price_cents: number
          stripe_price_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits: number
          id?: string
          name: string
          price_cents: number
          stripe_price_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          credits?: number
          id?: string
          name?: string
          price_cents?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      media_sites: {
        Row: {
          about: string | null
          agency: string | null
          category: string
          country: string | null
          created_at: string
          favicon: string | null
          google_index: string
          id: string
          link: string
          marks: string
          max_images: number | null
          max_words: number | null
          name: string
          price: number
          publication_format: string
          publishing_time: string
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          about?: string | null
          agency?: string | null
          category?: string
          country?: string | null
          created_at?: string
          favicon?: string | null
          google_index?: string
          id?: string
          link: string
          marks?: string
          max_images?: number | null
          max_words?: number | null
          name: string
          price?: number
          publication_format?: string
          publishing_time?: string
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          about?: string | null
          agency?: string | null
          category?: string
          country?: string | null
          created_at?: string
          favicon?: string | null
          google_index?: string
          id?: string
          link?: string
          marks?: string
          max_images?: number | null
          max_words?: number | null
          name?: string
          price?: number
          publication_format?: string
          publishing_time?: string
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          accepted_at: string | null
          agency_payout_cents: number
          amount_cents: number
          created_at: string
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string
          delivery_url: string | null
          id: string
          media_site_id: string
          paid_at: string | null
          platform_fee_cents: number
          released_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          agency_payout_cents?: number
          amount_cents: number
          created_at?: string
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string
          delivery_url?: string | null
          id?: string
          media_site_id: string
          paid_at?: string | null
          platform_fee_cents?: number
          released_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          agency_payout_cents?: number
          amount_cents?: number
          created_at?: string
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string
          delivery_url?: string | null
          id?: string
          media_site_id?: string
          paid_at?: string | null
          platform_fee_cents?: number
          released_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_media_site_id_fkey"
            columns: ["media_site_id"]
            isOneToOne: false
            referencedRelation: "media_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_transactions: {
        Row: {
          agency_payout_id: string
          amount_cents: number
          completed_at: string | null
          created_at: string
          id: string
          order_id: string
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          agency_payout_id: string
          amount_cents: number
          completed_at?: string | null
          created_at?: string
          id?: string
          order_id: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          agency_payout_id?: string
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          order_id?: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_transactions_agency_payout_id_fkey"
            columns: ["agency_payout_id"]
            isOneToOne: false
            referencedRelation: "agency_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          email_verified: boolean
          id: string
          pin_enabled: boolean
          pin_hash: string | null
          pin_salt: string | null
          updated_at: string
          username: string | null
          verification_token: string | null
          verification_token_expires_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id: string
          pin_enabled?: boolean
          pin_hash?: string | null
          pin_salt?: string | null
          updated_at?: string
          username?: string | null
          verification_token?: string | null
          verification_token_expires_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          pin_enabled?: boolean
          pin_hash?: string | null
          pin_salt?: string | null
          updated_at?: string
          username?: string | null
          verification_token?: string | null
          verification_token_expires_at?: string | null
        }
        Relationships: []
      }
      service_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          request_id: string
          sender_id: string
          sender_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          request_id: string
          sender_id: string
          sender_type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          request_id?: string
          sender_id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          agency_payout_id: string | null
          created_at: string
          description: string
          id: string
          media_site_id: string
          order_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_payout_id?: string | null
          created_at?: string
          description: string
          id?: string
          media_site_id: string
          order_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_payout_id?: string | null
          created_at?: string
          description?: string
          id?: string
          media_site_id?: string
          order_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_agency_payout_id_fkey"
            columns: ["agency_payout_id"]
            isOneToOne: false
            referencedRelation: "agency_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_media_site_id_fkey"
            columns: ["media_site_id"]
            isOneToOne: false
            referencedRelation: "media_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      site_credits: {
        Row: {
          created_at: string
          credits_required: number
          id: string
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_required?: number
          id?: string
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_required?: number
          id?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          site_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          site_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          site_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_publish: boolean
          created_at: string
          default_tone: string
          id: string
          selected_sources: string[]
          target_sites: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_publish?: boolean
          created_at?: string
          default_tone?: string
          id?: string
          selected_sources?: string[]
          target_sites?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_publish?: boolean
          created_at?: string
          default_tone?: string
          id?: string
          selected_sources?: string[]
          target_sites?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wordpress_sites: {
        Row: {
          app_password: string
          connected: boolean
          created_at: string
          favicon: string | null
          id: string
          name: string
          seo_plugin: string
          updated_at: string
          url: string
          username: string
        }
        Insert: {
          app_password: string
          connected?: boolean
          created_at?: string
          favicon?: string | null
          id?: string
          name: string
          seo_plugin?: string
          updated_at?: string
          url: string
          username: string
        }
        Update: {
          app_password?: string
          connected?: boolean
          created_at?: string
          favicon?: string | null
          id?: string
          name?: string
          seo_plugin?: string
          updated_at?: string
          url?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_sites: {
        Args: never
        Returns: {
          connected: boolean
          favicon: string
          id: string
          name: string
          seo_plugin: string
          url: string
        }[]
      }
      get_user_credits: { Args: { _user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
