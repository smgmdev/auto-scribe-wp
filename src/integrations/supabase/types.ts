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
      admin_audit_log: {
        Row: {
          action_type: string
          admin_id: string
          details: Json | null
          id: string
          performed_at: string
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          details?: Json | null
          id?: string
          performed_at?: string
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          details?: Json | null
          id?: string
          performed_at?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_investigations: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          notes: string | null
          order_id: string | null
          service_request_id: string
          status: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          service_request_id: string
          status?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          service_request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_investigations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_investigations_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_applications: {
        Row: {
          admin_notes: string | null
          agency_description: string | null
          agency_name: string
          agency_website: string
          cancelled_at: string | null
          country: string
          created_at: string
          email: string
          full_name: string
          hidden: boolean
          id: string
          incorporation_document_url: string
          logo_url: string | null
          media_channels: string | null
          media_niches: string[] | null
          payout_method: string | null
          pre_approved_at: string | null
          read: boolean
          rejected_at: string | null
          rejection_seen: boolean
          reviewed_at: string | null
          status: string
          updated_at: string
          user_id: string
          whatsapp_phone: string
          wp_blog_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          agency_description?: string | null
          agency_name: string
          agency_website: string
          cancelled_at?: string | null
          country: string
          created_at?: string
          email: string
          full_name: string
          hidden?: boolean
          id?: string
          incorporation_document_url: string
          logo_url?: string | null
          media_channels?: string | null
          media_niches?: string[] | null
          payout_method?: string | null
          pre_approved_at?: string | null
          read?: boolean
          rejected_at?: string | null
          rejection_seen?: boolean
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_phone: string
          wp_blog_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          agency_description?: string | null
          agency_name?: string
          agency_website?: string
          cancelled_at?: string | null
          country?: string
          created_at?: string
          email?: string
          full_name?: string
          hidden?: boolean
          id?: string
          incorporation_document_url?: string
          logo_url?: string | null
          media_channels?: string | null
          media_niches?: string[] | null
          payout_method?: string | null
          pre_approved_at?: string | null
          read?: boolean
          rejected_at?: string | null
          rejection_seen?: boolean
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_phone?: string
          wp_blog_url?: string | null
        }
        Relationships: []
      }
      agency_custom_verifications: {
        Row: {
          additional_documents_url: string | null
          admin_notes: string | null
          agency_payout_id: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_address: string | null
          bank_country: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_swift_code: string | null
          company_address: string | null
          company_documents_url: string | null
          company_id: string | null
          company_name: string
          country: string
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          last_name: string | null
          passport_url: string | null
          phone: string | null
          read: boolean
          reviewed_at: string | null
          status: string
          submitted_at: string | null
          tax_number: string | null
          updated_at: string
          usdt_network: string | null
          usdt_wallet_address: string | null
          user_id: string
        }
        Insert: {
          additional_documents_url?: string | null
          admin_notes?: string | null
          agency_payout_id?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_address?: string | null
          bank_country?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift_code?: string | null
          company_address?: string | null
          company_documents_url?: string | null
          company_id?: string | null
          company_name: string
          country: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          last_name?: string | null
          passport_url?: string | null
          phone?: string | null
          read?: boolean
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          tax_number?: string | null
          updated_at?: string
          usdt_network?: string | null
          usdt_wallet_address?: string | null
          user_id: string
        }
        Update: {
          additional_documents_url?: string | null
          admin_notes?: string | null
          agency_payout_id?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_address?: string | null
          bank_country?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_swift_code?: string | null
          company_address?: string | null
          company_documents_url?: string | null
          company_id?: string | null
          company_name?: string
          country?: string
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          last_name?: string | null
          passport_url?: string | null
          phone?: string | null
          read?: boolean
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          tax_number?: string | null
          updated_at?: string
          usdt_network?: string | null
          usdt_wallet_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_custom_verifications_agency_payout_id_fkey"
            columns: ["agency_payout_id"]
            isOneToOne: false
            referencedRelation: "agency_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_payouts: {
        Row: {
          agency_name: string
          commission_percentage: number
          country: string | null
          created_at: string
          downgrade_reason: string | null
          downgraded: boolean
          email: string | null
          id: string
          invite_sent_at: string | null
          last_login_at: string | null
          last_online_at: string | null
          onboarding_complete: boolean
          password_hash: string | null
          payout_method: string | null
          stripe_account_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agency_name: string
          commission_percentage?: number
          country?: string | null
          created_at?: string
          downgrade_reason?: string | null
          downgraded?: boolean
          email?: string | null
          id?: string
          invite_sent_at?: string | null
          last_login_at?: string | null
          last_online_at?: string | null
          onboarding_complete?: boolean
          password_hash?: string | null
          payout_method?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agency_name?: string
          commission_percentage?: number
          country?: string | null
          created_at?: string
          downgrade_reason?: string | null
          downgraded?: boolean
          email?: string | null
          id?: string
          invite_sent_at?: string | null
          last_login_at?: string | null
          last_online_at?: string | null
          onboarding_complete?: boolean
          password_hash?: string | null
          payout_method?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agency_sessions: {
        Row: {
          agency_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          expires_at: string
          id?: string
          token: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_sessions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_withdrawals: {
        Row: {
          admin_notes: string | null
          agency_payout_id: string | null
          amount_cents: number
          bank_details: Json | null
          created_at: string
          crypto_details: Json | null
          id: string
          processed_at: string | null
          processed_by: string | null
          read: boolean
          status: string
          user_id: string
          withdrawal_method: string
        }
        Insert: {
          admin_notes?: string | null
          agency_payout_id?: string | null
          amount_cents: number
          bank_details?: Json | null
          created_at?: string
          crypto_details?: Json | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          read?: boolean
          status?: string
          user_id: string
          withdrawal_method: string
        }
        Update: {
          admin_notes?: string | null
          agency_payout_id?: string | null
          amount_cents?: number
          bank_details?: Json | null
          created_at?: string
          crypto_details?: Json | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          read?: boolean
          status?: string
          user_id?: string
          withdrawal_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_withdrawals_agency_payout_id_fkey"
            columns: ["agency_payout_id"]
            isOneToOne: false
            referencedRelation: "agency_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_published_sources: {
        Row: {
          ai_title: string | null
          created_at: string
          focus_keyword: string | null
          id: string
          image_caption: string | null
          image_url: string | null
          meta_description: string | null
          published_at: string
          setting_id: string | null
          source_config_name: string | null
          source_title: string
          source_url: string
          tags: string[] | null
          word_count: number | null
          wordpress_post_id: number | null
          wordpress_post_link: string | null
          wordpress_site_favicon: string | null
          wordpress_site_id: string | null
          wordpress_site_name: string | null
        }
        Insert: {
          ai_title?: string | null
          created_at?: string
          focus_keyword?: string | null
          id?: string
          image_caption?: string | null
          image_url?: string | null
          meta_description?: string | null
          published_at?: string
          setting_id?: string | null
          source_config_name?: string | null
          source_title: string
          source_url: string
          tags?: string[] | null
          word_count?: number | null
          wordpress_post_id?: number | null
          wordpress_post_link?: string | null
          wordpress_site_favicon?: string | null
          wordpress_site_id?: string | null
          wordpress_site_name?: string | null
        }
        Update: {
          ai_title?: string | null
          created_at?: string
          focus_keyword?: string | null
          id?: string
          image_caption?: string | null
          image_url?: string | null
          meta_description?: string | null
          published_at?: string
          setting_id?: string | null
          source_config_name?: string | null
          source_title?: string
          source_url?: string
          tags?: string[] | null
          word_count?: number | null
          wordpress_post_id?: number | null
          wordpress_post_link?: string | null
          wordpress_site_favicon?: string | null
          wordpress_site_id?: string | null
          wordpress_site_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_published_sources_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "ai_publishing_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_publishing_settings: {
        Row: {
          auto_publish: boolean
          created_at: string
          created_by: string
          enabled: boolean
          fetch_images: boolean
          id: string
          last_fetched_at: string | null
          last_published_at: string | null
          publish_interval_minutes: number
          rewrite_enabled: boolean
          source_name: string
          source_url: string
          target_category_id: number | null
          target_category_name: string | null
          target_site_id: string | null
          tone: string
          updated_at: string
        }
        Insert: {
          auto_publish?: boolean
          created_at?: string
          created_by: string
          enabled?: boolean
          fetch_images?: boolean
          id?: string
          last_fetched_at?: string | null
          last_published_at?: string | null
          publish_interval_minutes?: number
          rewrite_enabled?: boolean
          source_name: string
          source_url: string
          target_category_id?: number | null
          target_category_name?: string | null
          target_site_id?: string | null
          tone?: string
          updated_at?: string
        }
        Update: {
          auto_publish?: boolean
          created_at?: string
          created_by?: string
          enabled?: boolean
          fetch_images?: boolean
          id?: string
          last_fetched_at?: string | null
          last_published_at?: string | null
          publish_interval_minutes?: number
          rewrite_enabled?: boolean
          source_name?: string
          source_url?: string
          target_category_id?: number | null
          target_category_name?: string | null
          target_site_id?: string | null
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_publishing_settings_target_site_id_fkey"
            columns: ["target_site_id"]
            isOneToOne: false
            referencedRelation: "wordpress_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_sources: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          categories: number[] | null
          content: string
          created_at: string
          featured_image: Json | null
          focus_keyword: string | null
          id: string
          meta_description: string | null
          published_to: string | null
          published_to_favicon: string | null
          published_to_name: string | null
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
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          published_to?: string | null
          published_to_favicon?: string | null
          published_to_name?: string | null
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
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          published_to?: string | null
          published_to_favicon?: string | null
          published_to_name?: string | null
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
      auto_publish_locks: {
        Row: {
          locked_at: string
          locked_by: string
          source_url: string
        }
        Insert: {
          locked_at?: string
          locked_by: string
          source_url: string
        }
        Update: {
          locked_at?: string
          locked_by?: string
          source_url?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          admin_notes: string | null
          attachment_url: string | null
          category: string
          created_at: string
          description: string
          id: string
          reporter_email: string
          status: string
          steps_to_reproduce: string | null
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          attachment_url?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          reporter_email: string
          status?: string
          steps_to_reproduce?: string | null
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          reporter_email?: string
          status?: string
          steps_to_reproduce?: string | null
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      conflict_simulations: {
        Row: {
          completed_at: string | null
          country_a: string
          country_b: string
          created_at: string
          error_message: string | null
          id: string
          result: Json | null
          run_id: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          country_a: string
          country_b: string
          created_at?: string
          error_message?: string | null
          id?: string
          result?: Json | null
          run_id: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          country_a?: string
          country_b?: string
          created_at?: string
          error_message?: string | null
          id?: string
          result?: Json | null
          run_id?: string
          status?: string
          user_id?: string
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
          metadata: Json | null
          order_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_missile_alerts: {
        Row: {
          alert_id: string
          dismissed_at: string
          dismissed_title: string | null
          id: string
          user_id: string
        }
        Insert: {
          alert_id: string
          dismissed_at?: string
          dismissed_title?: string | null
          id?: string
          user_id: string
        }
        Update: {
          alert_id?: string
          dismissed_at?: string
          dismissed_title?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_missile_alerts_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "missile_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          admin_notes: string | null
          admin_read: boolean
          created_at: string
          id: string
          order_id: string
          read: boolean
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          service_request_id: string
          status: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          admin_read?: boolean
          created_at?: string
          id?: string
          order_id: string
          read?: boolean
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          service_request_id: string
          status?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          admin_read?: boolean
          created_at?: string
          id?: string
          order_id?: string
          read?: boolean
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          service_request_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      flagged_chat_messages: {
        Row: {
          created_at: string
          detected_type: string
          detected_value: string
          flagged_at: string
          id: string
          message_id: string
          message_text: string
          request_id: string
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          sender_id: string
          sender_type: string
        }
        Insert: {
          created_at?: string
          detected_type: string
          detected_value: string
          flagged_at?: string
          id?: string
          message_id: string
          message_text: string
          request_id: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_id: string
          sender_type: string
        }
        Update: {
          created_at?: string
          detected_type?: string
          detected_value?: string
          flagged_at?: string
          id?: string
          message_id?: string
          message_text?: string
          request_id?: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_id?: string
          sender_type?: string
        }
        Relationships: []
      }
      lost_chat_global_state: {
        Row: {
          active_model_id: string
          id: string
          model_selection_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_model_id?: string
          id?: string
          model_selection_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_model_id?: string
          id?: string
          model_selection_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lost_chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          nickname: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          nickname?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          nickname?: string
        }
        Relationships: []
      }
      mace_site_categories: {
        Row: {
          category_id: number
          category_name: string
          created_at: string
          has_image: boolean
          id: string
          site_id: string
        }
        Insert: {
          category_id: number
          category_name: string
          created_at?: string
          has_image?: boolean
          id?: string
          site_id: string
        }
        Update: {
          category_id?: number
          category_name?: string
          created_at?: string
          has_image?: boolean
          id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mace_site_categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "wordpress_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      media_site_submissions: {
        Row: {
          admin_notes: string | null
          agency_name: string
          created_at: string
          google_sheet_url: string
          id: string
          read: boolean
          rejected_media: Json | null
          reviewed_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          agency_name: string
          created_at?: string
          google_sheet_url: string
          id?: string
          read?: boolean
          rejected_media?: Json | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          agency_name?: string
          created_at?: string
          google_sheet_url?: string
          id?: string
          read?: boolean
          rejected_media?: Json | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
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
      minimized_chats: {
        Row: {
          chat_type: string
          created_at: string
          id: string
          media_site_favicon: string | null
          media_site_name: string | null
          request_id: string
          title: string
          unread_count: number
          user_id: string
        }
        Insert: {
          chat_type?: string
          created_at?: string
          id?: string
          media_site_favicon?: string | null
          media_site_name?: string | null
          request_id: string
          title: string
          unread_count?: number
          user_id: string
        }
        Update: {
          chat_type?: string
          created_at?: string
          id?: string
          media_site_favicon?: string | null
          media_site_name?: string | null
          request_id?: string
          title?: string
          unread_count?: number
          user_id?: string
        }
        Relationships: []
      }
      missile_alerts: {
        Row: {
          active: boolean
          country_code: string | null
          country_name: string | null
          created_at: string
          description: string | null
          destination_country_code: string | null
          destination_country_name: string | null
          id: string
          origin_country_code: string | null
          origin_country_name: string | null
          published_at: string | null
          severity: string
          source: string | null
          title: string
        }
        Insert: {
          active?: boolean
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          description?: string | null
          destination_country_code?: string | null
          destination_country_name?: string | null
          id?: string
          origin_country_code?: string | null
          origin_country_name?: string | null
          published_at?: string | null
          severity?: string
          source?: string | null
          title: string
        }
        Update: {
          active?: boolean
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          description?: string | null
          destination_country_code?: string | null
          destination_country_name?: string | null
          id?: string
          origin_country_code?: string | null
          origin_country_name?: string | null
          published_at?: string | null
          severity?: string
          source?: string | null
          title?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          accepted_at: string | null
          agency_payout_cents: number
          agency_read: boolean
          amount_cents: number
          created_at: string
          delivered_at: string | null
          delivery_deadline: string | null
          delivery_notes: string | null
          delivery_status: string
          delivery_url: string | null
          id: string
          media_site_id: string
          order_number: string | null
          paid_at: string | null
          platform_fee_cents: number
          read: boolean
          released_at: string | null
          special_terms: string | null
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          agency_payout_cents?: number
          agency_read?: boolean
          amount_cents: number
          created_at?: string
          delivered_at?: string | null
          delivery_deadline?: string | null
          delivery_notes?: string | null
          delivery_status?: string
          delivery_url?: string | null
          id?: string
          media_site_id: string
          order_number?: string | null
          paid_at?: string | null
          platform_fee_cents?: number
          read?: boolean
          released_at?: string | null
          special_terms?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          agency_payout_cents?: number
          agency_read?: boolean
          amount_cents?: number
          created_at?: string
          delivered_at?: string | null
          delivery_deadline?: string | null
          delivery_notes?: string | null
          delivery_status?: string
          delivery_url?: string | null
          id?: string
          media_site_id?: string
          order_number?: string | null
          paid_at?: string | null
          platform_fee_cents?: number
          read?: boolean
          released_at?: string | null
          special_terms?: string | null
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
      pin_attempts: {
        Row: {
          attempted_at: string
          id: string
          success: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          success?: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      precision_contact_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          mobile_number: string
          organization_type: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          mobile_number: string
          organization_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          mobile_number?: string
          organization_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      press_release_categories: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      press_release_contacts: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id: string
          name: string
          phone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      press_releases: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string
          footer_contacts: string[] | null
          id: string
          image_url: string | null
          published: boolean
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by: string
          footer_contacts?: string[] | null
          id?: string
          image_url?: string | null
          published?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string
          footer_contacts?: string[] | null
          id?: string
          image_url?: string | null
          published?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_session_id: string | null
          created_at: string
          email: string | null
          email_verified: boolean
          id: string
          last_online_at: string | null
          pin_enabled: boolean
          pin_hash: string | null
          pin_salt: string | null
          precision_enabled: boolean
          session_started_at: string | null
          suspended: boolean
          telegram_chat_id: string | null
          updated_at: string
          username: string | null
          verification_token: string | null
          verification_token_expires_at: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          active_session_id?: string | null
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id: string
          last_online_at?: string | null
          pin_enabled?: boolean
          pin_hash?: string | null
          pin_salt?: string | null
          precision_enabled?: boolean
          session_started_at?: string | null
          suspended?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          username?: string | null
          verification_token?: string | null
          verification_token_expires_at?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          active_session_id?: string | null
          created_at?: string
          email?: string | null
          email_verified?: boolean
          id?: string
          last_online_at?: string | null
          pin_enabled?: boolean
          pin_hash?: string | null
          pin_salt?: string | null
          precision_enabled?: boolean
          session_started_at?: string | null
          suspended?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          username?: string | null
          verification_token?: string | null
          verification_token_expires_at?: string | null
          whatsapp_phone?: string | null
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
          agency_last_read_at: string | null
          agency_payout_id: string | null
          agency_read: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_last_read_at: string | null
          client_read: boolean
          created_at: string
          description: string
          id: string
          media_site_id: string
          order_id: string | null
          read: boolean
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_last_read_at?: string | null
          agency_payout_id?: string | null
          agency_read?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_last_read_at?: string | null
          client_read?: boolean
          created_at?: string
          description: string
          id?: string
          media_site_id: string
          order_id?: string | null
          read?: boolean
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_last_read_at?: string | null
          agency_payout_id?: string | null
          agency_read?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_last_read_at?: string | null
          client_read?: boolean
          created_at?: string
          description?: string
          id?: string
          media_site_id?: string
          order_id?: string | null
          read?: boolean
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
      signup_attempts: {
        Row: {
          attempted_at: string
          blocked: boolean
          email: string
          id: string
          ip_address: string
        }
        Insert: {
          attempted_at?: string
          blocked?: boolean
          email: string
          id?: string
          ip_address: string
        }
        Update: {
          attempted_at?: string
          blocked?: boolean
          email?: string
          id?: string
          ip_address?: string
        }
        Relationships: []
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
      support_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_read: boolean
          closed_at: string | null
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
          user_read: boolean
        }
        Insert: {
          admin_read?: boolean
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
          user_read?: boolean
        }
        Update: {
          admin_read?: boolean
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
          user_read?: boolean
        }
        Relationships: []
      }
      surveillance_scans: {
        Row: {
          country_data: Json
          created_at: string
          events: Json
          global_tension_level: string
          global_tension_score: number
          id: string
          scanned_at: string
          source: string
        }
        Insert: {
          country_data?: Json
          created_at?: string
          events?: Json
          global_tension_level?: string
          global_tension_score?: number
          id?: string
          scanned_at?: string
          source?: string
        }
        Update: {
          country_data?: Json
          created_at?: string
          events?: Json
          global_tension_level?: string
          global_tension_score?: number
          id?: string
          scanned_at?: string
          source?: string
        }
        Relationships: []
      }
      telegram_bot_sessions: {
        Row: {
          chat_id: string
          session_data: Json
          updated_at: string
        }
        Insert: {
          chat_id: string
          session_data?: Json
          updated_at?: string
        }
        Update: {
          chat_id?: string
          session_data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      telegram_verification_sessions: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          telegram_chat_id: string
          verify_code: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          telegram_chat_id: string
          verify_code: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          telegram_chat_id?: string
          verify_code?: string
        }
        Relationships: []
      }
      threat_forecasts: {
        Row: {
          created_at: string
          data_points: Json
          forecast: Json
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_points?: Json
          forecast: Json
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_points?: Json
          forecast?: Json
          id?: string
          user_id?: string
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
      wordpress_site_submissions: {
        Row: {
          admin_notes: string | null
          app_password: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          price: number | null
          read: boolean
          reviewed_at: string | null
          seo_plugin: string
          status: string
          updated_at: string
          url: string
          user_id: string
          username: string
        }
        Insert: {
          admin_notes?: string | null
          app_password: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          price?: number | null
          read?: boolean
          reviewed_at?: string | null
          seo_plugin?: string
          status?: string
          updated_at?: string
          url: string
          user_id: string
          username: string
        }
        Update: {
          admin_notes?: string | null
          app_password?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          price?: number | null
          read?: boolean
          reviewed_at?: string | null
          seo_plugin?: string
          status?: string
          updated_at?: string
          url?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      wordpress_sites: {
        Row: {
          agency: string | null
          app_password: string
          connected: boolean
          created_at: string
          favicon: string | null
          id: string
          name: string
          read: boolean
          seo_plugin: string
          updated_at: string
          url: string
          user_id: string | null
          username: string
        }
        Insert: {
          agency?: string | null
          app_password: string
          connected?: boolean
          created_at?: string
          favicon?: string | null
          id?: string
          name: string
          read?: boolean
          seo_plugin?: string
          updated_at?: string
          url: string
          user_id?: string | null
          username: string
        }
        Update: {
          agency?: string | null
          app_password?: string
          connected?: boolean
          created_at?: string
          favicon?: string | null
          id?: string
          name?: string
          read?: boolean
          seo_plugin?: string
          updated_at?: string
          url?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_active_session: { Args: { check_email: string }; Returns: string }
      check_email_verified: { Args: { check_email: string }; Returns: boolean }
      check_rate_limit: {
        Args: {
          _identifier: string
          _max_attempts?: number
          _window_seconds?: number
        }
        Returns: boolean
      }
      check_user_status: { Args: { check_email: string }; Returns: string }
      check_user_suspended: { Args: { check_email: string }; Returns: boolean }
      get_active_agency_payouts: {
        Args: never
        Returns: {
          agency_name: string
          id: string
          user_id: string
        }[]
      }
      get_active_credit_packs: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          credits: number
          id: string
          name: string
          price_cents: number
        }[]
      }
      get_admin_online_status: { Args: never; Returns: boolean }
      get_agency_info_by_payout_id: {
        Args: { _payout_id: string }
        Returns: {
          agency_name: string
          logo_url: string
        }[]
      }
      get_agency_payout_id_by_name: {
        Args: { _agency_name: string }
        Returns: string
      }
      get_counterparty_online_status: {
        Args: { _request_id: string }
        Returns: {
          is_online: boolean
          last_online_at: string
        }[]
      }
      get_latest_auto_published: {
        Args: never
        Returns: {
          ai_title: string
          id: string
          published_at: string
          source_title: string
          wordpress_site_favicon: string
          wordpress_site_name: string
        }[]
      }
      get_my_wp_submissions: {
        Args: { _user_id: string }
        Returns: {
          admin_notes: string
          created_at: string
          id: string
          logo_url: string
          name: string
          read: boolean
          reviewed_at: string
          seo_plugin: string
          status: string
          updated_at: string
          url: string
        }[]
      }
      get_press_release_categories: {
        Args: never
        Returns: {
          created_at: string
          id: string
          name: string
        }[]
      }
      get_public_agencies: {
        Args: never
        Returns: {
          agency_name: string
          country: string
          id: string
          logo_url: string
          media_niches: string[]
        }[]
      }
      get_public_agency_details: {
        Args: { _agency_name: string }
        Returns: {
          agency_description: string
          agency_name: string
          agency_website: string
          country: string
          created_at: string
          logo_url: string
        }[]
      }
      get_public_sites: {
        Args: never
        Returns: {
          agency: string
          connected: boolean
          favicon: string
          id: string
          name: string
          seo_plugin: string
          url: string
        }[]
      }
      get_published_articles: {
        Args: never
        Returns: {
          content: string
          created_at: string
          featured_image: Json
          focus_keyword: string
          id: string
          meta_description: string
          published_to: string
          published_to_favicon: string
          published_to_name: string
          status: string
          tags: string[]
          title: string
          tone: string
          updated_at: string
          wp_link: string
        }[]
      }
      get_published_press_releases: {
        Args: never
        Returns: {
          category: string
          content: string
          created_at: string
          footer_contacts: string[]
          id: string
          image_url: string
          published: boolean
          published_at: string
          title: string
          updated_at: string
        }[]
      }
      get_random_published_articles: {
        Args: never
        Returns: {
          content: string
          created_at: string
          featured_image: Json
          focus_keyword: string
          id: string
          meta_description: string
          published_to: string
          published_to_favicon: string
          published_to_name: string
          status: string
          tags: string[]
          title: string
          tone: string
          updated_at: string
          wp_link: string
        }[]
      }
      get_user_credits: { Args: { _user_id: string }; Returns: number }
      has_credit_history: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_precision_enabled: { Args: { _user_id: string }; Returns: boolean }
      register_active_session: {
        Args: { _session_id: string; _user_id: string }
        Returns: undefined
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
