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
      action_items: {
        Row: {
          business_id: string
          category: string
          created_at: string
          due_date: string | null
          id: string
          is_demo: boolean
          priority: string
          status: string
          title: string
        }
        Insert: {
          business_id: string
          category: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_demo?: boolean
          priority?: string
          status?: string
          title: string
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_demo?: boolean
          priority?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      advance_tax_schedule: {
        Row: {
          amount_due: number
          business_id: string
          created_at: string
          cumulative_pct: number
          due_date: string
          financial_year: string
          id: string
          instalment_number: number
          is_demo: boolean
          section_80iac_exempt: boolean
          status: string
        }
        Insert: {
          amount_due?: number
          business_id: string
          created_at?: string
          cumulative_pct?: number
          due_date: string
          financial_year?: string
          id?: string
          instalment_number: number
          is_demo?: boolean
          section_80iac_exempt?: boolean
          status?: string
        }
        Update: {
          amount_due?: number
          business_id?: string
          created_at?: string
          cumulative_pct?: number
          due_date?: string
          financial_year?: string
          id?: string
          instalment_number?: number
          is_demo?: boolean
          section_80iac_exempt?: boolean
          status?: string
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          business_id: string
          confidence_score: number
          created_at: string
          data_quality: string
          generated_at: string
          id: string
          message: string
          module: string
        }
        Insert: {
          business_id: string
          confidence_score?: number
          created_at?: string
          data_quality?: string
          generated_at?: string
          id?: string
          message: string
          module: string
        }
        Update: {
          business_id?: string
          confidence_score?: number
          created_at?: string
          data_quality?: string
          generated_at?: string
          id?: string
          message?: string
          module?: string
        }
        Relationships: []
      }
      ai_usage_limits: {
        Row: {
          business_id: string | null
          created_at: string
          daily_request_limit: number
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          daily_request_limit?: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          daily_request_limit?: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          business_id: string | null
          cost_usd: number | null
          created_at: string
          error_message: string | null
          feature: string
          id: string
          model: string
          prompt: string
          response: string | null
          response_time_ms: number | null
          status: string
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          feature?: string
          id?: string
          model?: string
          prompt: string
          response?: string | null
          response_time_ms?: number | null
          status?: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          cost_usd?: number | null
          created_at?: string
          error_message?: string | null
          feature?: string
          id?: string
          model?: string
          prompt?: string
          response?: string | null
          response_time_ms?: number | null
          status?: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      alerts: {
        Row: {
          action_url: string | null
          body: string | null
          business_id: string
          created_at: string
          details: string | null
          dismissed: boolean | null
          id: string
          impact: string | null
          resolved: boolean
          severity: string
          suggested_action: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          business_id: string
          created_at?: string
          details?: string | null
          dismissed?: boolean | null
          id?: string
          impact?: string | null
          resolved?: boolean
          severity: string
          suggested_action?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          business_id?: string
          created_at?: string
          details?: string | null
          dismissed?: boolean | null
          id?: string
          impact?: string | null
          resolved?: boolean
          severity?: string
          suggested_action?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_link_events: {
        Row: {
          created_at: string
          description: string | null
          error_code: string | null
          flow: string
          id: string
          reason: string
          route: string | null
          source: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          error_code?: string | null
          flow?: string
          id?: string
          reason: string
          route?: string | null
          source?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          error_code?: string | null
          flow?: string
          id?: string
          reason?: string
          route?: string | null
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          action: string
          attempt_count: number
          created_at: string
          first_attempt_at: string
          id: string
          identifier: string
          ip_address: string | null
          last_attempt_at: string
          locked_until: string | null
        }
        Insert: {
          action: string
          attempt_count?: number
          created_at?: string
          first_attempt_at?: string
          id?: string
          identifier: string
          ip_address?: string | null
          last_attempt_at?: string
          locked_until?: string | null
        }
        Update: {
          action?: string
          attempt_count?: number
          created_at?: string
          first_attempt_at?: string
          id?: string
          identifier?: string
          ip_address?: string | null
          last_attempt_at?: string
          locked_until?: string | null
        }
        Relationships: []
      }
      balance_sheet_snapshots: {
        Row: {
          accounts_payable: number
          accounts_receivable: number
          accrued: number
          business_id: string
          cash: number
          debt_to_equity: number
          fixed_assets: number
          id: string
          inventory: number
          is_demo: boolean
          long_term_debt: number
          other_assets: number
          short_term_debt: number
          snapshot_date: string
          total_assets: number
          total_equity: number
          total_liabilities: number
        }
        Insert: {
          accounts_payable?: number
          accounts_receivable?: number
          accrued?: number
          business_id: string
          cash?: number
          debt_to_equity?: number
          fixed_assets?: number
          id?: string
          inventory?: number
          is_demo?: boolean
          long_term_debt?: number
          other_assets?: number
          short_term_debt?: number
          snapshot_date: string
          total_assets?: number
          total_equity?: number
          total_liabilities?: number
        }
        Update: {
          accounts_payable?: number
          accounts_receivable?: number
          accrued?: number
          business_id?: string
          cash?: number
          debt_to_equity?: number
          fixed_assets?: number
          id?: string
          inventory?: number
          is_demo?: boolean
          long_term_debt?: number
          other_assets?: number
          short_term_debt?: number
          snapshot_date?: string
          total_assets?: number
          total_equity?: number
          total_liabilities?: number
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          balance: number | null
          bank_name: string
          business_id: string
          connected: boolean
          created_at: string
          id: string
          last_sync: string | null
        }
        Insert: {
          account_number?: string | null
          balance?: number | null
          bank_name: string
          business_id: string
          connected?: boolean
          created_at?: string
          id?: string
          last_sync?: string | null
        }
        Update: {
          account_number?: string | null
          balance?: number | null
          bank_name?: string
          business_id?: string
          connected?: boolean
          created_at?: string
          id?: string
          last_sync?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance: number
          business_id: string
          category: string | null
          created_at: string
          date: string
          description: string | null
          id: string
          is_demo: boolean
          reconciled: boolean
          source_document_id: string | null
          source_reference: string | null
          source_type: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          balance: number
          business_id: string
          category?: string | null
          created_at?: string
          date: string
          description?: string | null
          id?: string
          is_demo?: boolean
          reconciled?: boolean
          source_document_id?: string | null
          source_reference?: string | null
          source_type?: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number
          business_id?: string
          category?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          reconciled?: boolean
          source_document_id?: string | null
          source_reference?: string | null
          source_type?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "business_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          archived_at: string | null
          author_id: string | null
          author_name: string
          author_role: string
          category: string | null
          content: string | null
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          featured_image: string | null
          id: string
          is_featured: boolean
          og_image: string | null
          published_at: string | null
          reading_time_minutes: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          archived_at?: string | null
          author_id?: string | null
          author_name?: string
          author_role?: string
          category?: string | null
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_featured?: boolean
          og_image?: string | null
          published_at?: string | null
          reading_time_minutes?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          archived_at?: string | null
          author_id?: string | null
          author_name?: string
          author_role?: string
          category?: string | null
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_featured?: boolean
          og_image?: string | null
          published_at?: string | null
          reading_time_minutes?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      business_documents: {
        Row: {
          business_id: string
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          parse_error: string | null
          parse_status: string
          rows_imported: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string
          rows_imported?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parse_error?: string | null
          parse_status?: string
          rows_imported?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      businesses: {
        Row: {
          business_name: string
          business_type: string | null
          created_at: string
          employee_count: string | null
          founding_member: boolean | null
          gstin: string | null
          id: string
          industry: string | null
          is_demo: boolean
          msme_udyam: string | null
          onboarding_completed: boolean
          onboarding_step: number
          plan: string | null
          razorpay_customer_id: string | null
          state: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          trial_expired_notified: boolean
          trial_reminder_1d_sent: boolean
          trial_reminder_7d_sent: boolean
          turnover_range: string | null
          updated_at: string
        }
        Insert: {
          business_name: string
          business_type?: string | null
          created_at?: string
          employee_count?: string | null
          founding_member?: boolean | null
          gstin?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          msme_udyam?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          plan?: string | null
          razorpay_customer_id?: string | null
          state?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          trial_expired_notified?: boolean
          trial_reminder_1d_sent?: boolean
          trial_reminder_7d_sent?: boolean
          turnover_range?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string
          business_type?: string | null
          created_at?: string
          employee_count?: string | null
          founding_member?: boolean | null
          gstin?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          msme_udyam?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          plan?: string | null
          razorpay_customer_id?: string | null
          state?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          trial_expired_notified?: boolean
          trial_reminder_1d_sent?: boolean
          trial_reminder_7d_sent?: boolean
          turnover_range?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ca_access_requests: {
        Row: {
          access_level: string
          business_id: string | null
          ca_firm_id: string
          created_at: string
          id: string
          message: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          target_email: string | null
          target_gstin: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          business_id?: string | null
          ca_firm_id: string
          created_at?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          target_email?: string | null
          target_gstin: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          business_id?: string | null
          ca_firm_id?: string
          created_at?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          target_email?: string | null
          target_gstin?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_activity_log: {
        Row: {
          action_type: string
          business_id: string | null
          ca_firm_id: string
          created_at: string | null
          description: string | null
          id: string
        }
        Insert: {
          action_type: string
          business_id?: string | null
          ca_firm_id: string
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Update: {
          action_type?: string
          business_id?: string | null
          ca_firm_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_activity_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_activity_log_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_approval_log: {
        Row: {
          action: string
          ca_firm_id: string | null
          created_at: string | null
          id: string
          reason: string | null
          reviewed_by_email: string
        }
        Insert: {
          action: string
          ca_firm_id?: string | null
          created_at?: string | null
          id?: string
          reason?: string | null
          reviewed_by_email: string
        }
        Update: {
          action?: string
          ca_firm_id?: string | null
          created_at?: string | null
          id?: string
          reason?: string | null
          reviewed_by_email?: string
        }
        Relationships: []
      }
      ca_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          business_id: string | null
          ca_firm_id: string
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
          source_document_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          business_id?: string | null
          ca_firm_id: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          source_document_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          business_id?: string | null
          ca_firm_id?: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          source_document_id?: string | null
        }
        Relationships: []
      }
      ca_bank_accounts_linked: {
        Row: {
          account_type: string | null
          business_id: string
          ca_firm_id: string
          consent_row_id: string
          created_at: string
          currency: string
          fip_name: string | null
          id: string
          ifsc: string | null
          link_ref: string | null
          masked_account_number: string | null
        }
        Insert: {
          account_type?: string | null
          business_id: string
          ca_firm_id: string
          consent_row_id: string
          created_at?: string
          currency?: string
          fip_name?: string | null
          id?: string
          ifsc?: string | null
          link_ref?: string | null
          masked_account_number?: string | null
        }
        Update: {
          account_type?: string | null
          business_id?: string
          ca_firm_id?: string
          consent_row_id?: string
          created_at?: string
          currency?: string
          fip_name?: string | null
          id?: string
          ifsc?: string | null
          link_ref?: string | null
          masked_account_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_bank_accounts_linked_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_bank_accounts_linked_consent_row_id_fkey"
            columns: ["consent_row_id"]
            isOneToOne: false
            referencedRelation: "ca_bank_consents"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_bank_consents: {
        Row: {
          business_id: string
          ca_firm_id: string
          consent_handle: string | null
          consent_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          raw: Json | null
          redirect_url: string | null
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          consent_handle?: string | null
          consent_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          raw?: Json | null
          redirect_url?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          consent_handle?: string | null
          consent_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          raw?: Json | null
          redirect_url?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_bank_consents_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_bank_fetch_sessions: {
        Row: {
          business_id: string
          ca_firm_id: string
          completed_at: string | null
          consent_row_id: string
          created_at: string
          error: string | null
          from_date: string | null
          id: string
          provider: string
          raw: Json | null
          session_ref: string | null
          status: string
          to_date: string | null
          txn_count: number
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          completed_at?: string | null
          consent_row_id: string
          created_at?: string
          error?: string | null
          from_date?: string | null
          id?: string
          provider?: string
          raw?: Json | null
          session_ref?: string | null
          status?: string
          to_date?: string | null
          txn_count?: number
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          completed_at?: string | null
          consent_row_id?: string
          created_at?: string
          error?: string | null
          from_date?: string | null
          id?: string
          provider?: string
          raw?: Json | null
          session_ref?: string | null
          status?: string
          to_date?: string | null
          txn_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ca_bank_fetch_sessions_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_bank_fetch_sessions_consent_row_id_fkey"
            columns: ["consent_row_id"]
            isOneToOne: false
            referencedRelation: "ca_bank_consents"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_brain_events: {
        Row: {
          actor_id: string | null
          business_id: string | null
          ca_firm_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          actor_id?: string | null
          business_id?: string | null
          ca_firm_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          actor_id?: string | null
          business_id?: string | null
          ca_firm_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      ca_bulk_filing_jobs: {
        Row: {
          ca_firm_id: string
          client_ids: string[]
          completed_at: string | null
          created_at: string
          created_by: string
          error_log: Json | null
          failed_clients: number
          filing_period: string
          filing_type: string
          id: string
          output_json: Json | null
          processed_clients: number
          started_at: string | null
          status: string
          total_clients: number
        }
        Insert: {
          ca_firm_id: string
          client_ids?: string[]
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_log?: Json | null
          failed_clients?: number
          filing_period: string
          filing_type: string
          id?: string
          output_json?: Json | null
          processed_clients?: number
          started_at?: string | null
          status?: string
          total_clients?: number
        }
        Update: {
          ca_firm_id?: string
          client_ids?: string[]
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_log?: Json | null
          failed_clients?: number
          filing_period?: string
          filing_type?: string
          id?: string
          output_json?: Json | null
          processed_clients?: number
          started_at?: string | null
          status?: string
          total_clients?: number
        }
        Relationships: [
          {
            foreignKeyName: "ca_bulk_filing_jobs_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_canonical_fields: {
        Row: {
          created_at: string
          data_type: string
          description: string | null
          display_label: string
          field_name: string
          id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          data_type?: string
          description?: string | null
          display_label: string
          field_name: string
          id?: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          data_type?: string
          description?: string | null
          display_label?: string
          field_name?: string
          id?: string
          unit?: string | null
        }
        Relationships: []
      }
      ca_chaser_events: {
        Row: {
          actor_id: string | null
          business_id: string | null
          ca_firm_id: string
          chaser_id: string
          created_at: string
          event_type: string
          id: string
          note: string | null
        }
        Insert: {
          actor_id?: string | null
          business_id?: string | null
          ca_firm_id: string
          chaser_id: string
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
        }
        Update: {
          actor_id?: string | null
          business_id?: string | null
          ca_firm_id?: string
          chaser_id?: string
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_chaser_events_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_client_access: {
        Row: {
          access_level: string | null
          business_id: string
          ca_firm_id: string
          client_reference_code: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          is_demo: boolean
          notes: string | null
          storage_namespace: string | null
        }
        Insert: {
          access_level?: string | null
          business_id: string
          ca_firm_id: string
          client_reference_code?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          notes?: string | null
          storage_namespace?: string | null
        }
        Update: {
          access_level?: string | null
          business_id?: string
          ca_firm_id?: string
          client_reference_code?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          notes?: string | null
          storage_namespace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_client_access_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_client_access_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_client_documents: {
        Row: {
          auto_matched: boolean
          business_id: string
          ca_firm_id: string
          client_reference_code: string
          created_at: string
          description: string | null
          document_type: string
          file_size_bytes: number | null
          filing_period: string | null
          id: string
          matched_request_id: string | null
          mime_type: string | null
          original_filename: string
          storage_path: string
          stored_filename: string
          uploaded_by: string
          virus_scan_at: string | null
          virus_scan_status: string
        }
        Insert: {
          auto_matched?: boolean
          business_id: string
          ca_firm_id: string
          client_reference_code: string
          created_at?: string
          description?: string | null
          document_type?: string
          file_size_bytes?: number | null
          filing_period?: string | null
          id?: string
          matched_request_id?: string | null
          mime_type?: string | null
          original_filename: string
          storage_path: string
          stored_filename: string
          uploaded_by: string
          virus_scan_at?: string | null
          virus_scan_status?: string
        }
        Update: {
          auto_matched?: boolean
          business_id?: string
          ca_firm_id?: string
          client_reference_code?: string
          created_at?: string
          description?: string | null
          document_type?: string
          file_size_bytes?: number | null
          filing_period?: string | null
          id?: string
          matched_request_id?: string | null
          mime_type?: string | null
          original_filename?: string
          storage_path?: string
          stored_filename?: string
          uploaded_by?: string
          virus_scan_at?: string | null
          virus_scan_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_client_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_client_documents_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_client_documents_matched_request_id_fkey"
            columns: ["matched_request_id"]
            isOneToOne: false
            referencedRelation: "ca_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_client_health_scores: {
        Row: {
          business_id: string
          ca_firm_id: string
          cash_runway_days: number | null
          cash_status: string
          compliance_score: number
          computed_at: string
          id: string
          is_demo: boolean
          itc_risk_amount: number | null
          overall_score: number
          overdue_filings: number
          pending_tds: number | null
          revenue_trend: string
          score_breakdown: Json | null
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          cash_runway_days?: number | null
          cash_status?: string
          compliance_score?: number
          computed_at?: string
          id?: string
          is_demo?: boolean
          itc_risk_amount?: number | null
          overall_score?: number
          overdue_filings?: number
          pending_tds?: number | null
          revenue_trend?: string
          score_breakdown?: Json | null
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          cash_runway_days?: number | null
          cash_status?: string
          compliance_score?: number
          computed_at?: string
          id?: string
          is_demo?: boolean
          itc_risk_amount?: number | null
          overall_score?: number
          overdue_filings?: number
          pending_tds?: number | null
          revenue_trend?: string
          score_breakdown?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_client_health_scores_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_client_health_scores_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_client_intelligence: {
        Row: {
          avg_days_before_due: number | null
          avg_response_days: number | null
          best_chase_day: number | null
          business_id: string
          ca_firm_id: string
          computed_at: string | null
          filing_risk_score: number | null
          id: string
          match_preferences: Json
          preferred_channel: string | null
          typical_docs_late: string[]
        }
        Insert: {
          avg_days_before_due?: number | null
          avg_response_days?: number | null
          best_chase_day?: number | null
          business_id: string
          ca_firm_id: string
          computed_at?: string | null
          filing_risk_score?: number | null
          id?: string
          match_preferences?: Json
          preferred_channel?: string | null
          typical_docs_late?: string[]
        }
        Update: {
          avg_days_before_due?: number | null
          avg_response_days?: number | null
          best_chase_day?: number | null
          business_id?: string
          ca_firm_id?: string
          computed_at?: string | null
          filing_risk_score?: number | null
          id?: string
          match_preferences?: Json
          preferred_channel?: string | null
          typical_docs_late?: string[]
        }
        Relationships: []
      }
      ca_client_invitations: {
        Row: {
          accepted_at: string | null
          access_level: string | null
          business_id: string | null
          ca_firm_id: string
          client_name: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          invited_email: string
          notes: string | null
          sent_by: string | null
          status: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          access_level?: string | null
          business_id?: string | null
          ca_firm_id: string
          client_name?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email: string
          notes?: string | null
          sent_by?: string | null
          status?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          access_level?: string | null
          business_id?: string | null
          ca_firm_id?: string
          client_name?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invited_email?: string
          notes?: string | null
          sent_by?: string | null
          status?: string | null
          token?: string
        }
        Relationships: []
      }
      ca_client_messages: {
        Row: {
          business_id: string
          ca_firm_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          sender_id: string
          sender_type: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          sender_id: string
          sender_type: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          sender_id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_client_messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_client_messages_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_client_periods: {
        Row: {
          business_id: string | null
          ca_firm_id: string
          client_id: string
          close_step_1: boolean
          close_step_2: boolean
          close_step_3: boolean
          close_step_4: boolean
          created_at: string
          id: string
          period: string
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          ca_firm_id: string
          client_id: string
          close_step_1?: boolean
          close_step_2?: boolean
          close_step_3?: boolean
          close_step_4?: boolean
          created_at?: string
          id?: string
          period: string
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string
          client_id?: string
          close_step_1?: boolean
          close_step_2?: boolean
          close_step_3?: boolean
          close_step_4?: boolean
          created_at?: string
          id?: string
          period?: string
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_client_periods_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_client_periods_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "ca_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_client_users: {
        Row: {
          business_id: string
          ca_firm_id: string
          contact_name: string | null
          created_at: string
          id: string
          invite_token: string
          invited_email: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          contact_name?: string | null
          created_at?: string
          id?: string
          invite_token?: string
          invited_email: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          invite_token?: string
          invited_email?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ca_clients: {
        Row: {
          assigned_to: string | null
          business_id: string | null
          ca_firm_id: string
          cin: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          client_status: string | null
          created_at: string | null
          dpiit_number: string | null
          entity_subtype: string | null
          entity_type: string
          group_id: string | null
          gstin: string | null
          id: string
          incorporation_date: string | null
          is_demo: boolean | null
          last_activity_at: string | null
          llpin: string | null
          notes: string | null
          onboarded_at: string | null
          ownership_pct: number | null
          pan: string | null
          parent_id: string | null
          udyam_number: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_id?: string | null
          ca_firm_id: string
          cin?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          client_status?: string | null
          created_at?: string | null
          dpiit_number?: string | null
          entity_subtype?: string | null
          entity_type?: string
          group_id?: string | null
          gstin?: string | null
          id?: string
          incorporation_date?: string | null
          is_demo?: boolean | null
          last_activity_at?: string | null
          llpin?: string | null
          notes?: string | null
          onboarded_at?: string | null
          ownership_pct?: number | null
          pan?: string | null
          parent_id?: string | null
          udyam_number?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_id?: string | null
          ca_firm_id?: string
          cin?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          client_status?: string | null
          created_at?: string | null
          dpiit_number?: string | null
          entity_subtype?: string | null
          entity_type?: string
          group_id?: string | null
          gstin?: string | null
          id?: string
          incorporation_date?: string | null
          is_demo?: boolean | null
          last_activity_at?: string | null
          llpin?: string | null
          notes?: string | null
          onboarded_at?: string | null
          ownership_pct?: number | null
          pan?: string | null
          parent_id?: string | null
          udyam_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_clients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ca_entity_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_clients_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ca_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_close_periods: {
        Row: {
          business_id: string
          ca_firm_id: string
          checklist: Json
          created_at: string
          id: string
          period: string
          readiness_score: number
          signed_off_at: string | null
          signed_off_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          checklist?: Json
          created_at?: string
          id?: string
          period: string
          readiness_score?: number
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          checklist?: Json
          created_at?: string
          id?: string
          period?: string
          readiness_score?: number
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_compliance_events: {
        Row: {
          business_id: string
          ca_firm_id: string
          created_at: string
          due_date: string
          event_type: string
          filed_at: string | null
          filed_by: string | null
          filing_date: string | null
          filing_period: string
          id: string
          is_demo: boolean
          late_fee_amount: number | null
          notes: string | null
          penalty_amount: number | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          created_at?: string
          due_date: string
          event_type: string
          filed_at?: string | null
          filed_by?: string | null
          filing_date?: string | null
          filing_period: string
          id?: string
          is_demo?: boolean
          late_fee_amount?: number | null
          notes?: string | null
          penalty_amount?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          due_date?: string
          event_type?: string
          filed_at?: string | null
          filed_by?: string | null
          filing_date?: string | null
          filing_period?: string
          id?: string
          is_demo?: boolean
          late_fee_amount?: number | null
          notes?: string | null
          penalty_amount?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_compliance_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_compliance_events_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_custom_field_defs: {
        Row: {
          ca_firm_id: string
          created_at: string
          field_key: string
          field_type: string
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json
          sort_order: number
        }
        Insert: {
          ca_firm_id: string
          created_at?: string
          field_key: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json
          sort_order?: number
        }
        Update: {
          ca_firm_id?: string
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json
          sort_order?: number
        }
        Relationships: []
      }
      ca_custom_field_values: {
        Row: {
          business_id: string | null
          ca_firm_id: string
          client_id: string | null
          field_id: string
          id: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          business_id?: string | null
          ca_firm_id: string
          client_id?: string | null
          field_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string
          client_id?: string | null
          field_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_custom_field_values_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "ca_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "ca_custom_field_defs"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_data_quality_issues: {
        Row: {
          business_id: string
          ca_firm_id: string
          created_at: string
          description: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
          issue_type: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string
          severity: string
          status: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          created_at?: string
          description: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          issue_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id: string
          severity?: string
          status?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          description?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          issue_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_data_quality_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ca_data_quality_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_data_quality_runs: {
        Row: {
          anomaly_count: number
          business_id: string
          ca_firm_id: string
          completeness_score: number
          created_at: string
          created_by: string | null
          duplicate_count: number
          id: string
          missing_field_count: number
          period: string
          summary: Json
          total_records: number
        }
        Insert: {
          anomaly_count?: number
          business_id: string
          ca_firm_id: string
          completeness_score?: number
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          id?: string
          missing_field_count?: number
          period: string
          summary?: Json
          total_records?: number
        }
        Update: {
          anomaly_count?: number
          business_id?: string
          ca_firm_id?: string
          completeness_score?: number
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          id?: string
          missing_field_count?: number
          period?: string
          summary?: Json
          total_records?: number
        }
        Relationships: []
      }
      ca_deduction_findings: {
        Row: {
          action_required: string
          actioned_at: string | null
          actioned_by: string | null
          business_id: string
          ca_firm_id: string
          category: string
          confidence: string
          created_at: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          estimated_benefit: number
          evidence: Json
          explanation: string
          id: string
          period: string
          provision: string
          provision_label: string
          status: string
          updated_at: string | null
        }
        Insert: {
          action_required: string
          actioned_at?: string | null
          actioned_by?: string | null
          business_id: string
          ca_firm_id: string
          category: string
          confidence?: string
          created_at?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          estimated_benefit?: number
          evidence?: Json
          explanation: string
          id?: string
          period: string
          provision: string
          provision_label: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          action_required?: string
          actioned_at?: string | null
          actioned_by?: string | null
          business_id?: string
          ca_firm_id?: string
          category?: string
          confidence?: string
          created_at?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          estimated_benefit?: number
          evidence?: Json
          explanation?: string
          id?: string
          period?: string
          provision?: string
          provision_label?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ca_document_extractions: {
        Row: {
          business_id: string | null
          ca_firm_id: string
          classification: string
          confidence: number
          corrected: Json | null
          correction_delta: Json | null
          created_at: string
          document_id: string | null
          error_message: string | null
          extracted: Json
          gmail_match_confidence: number | null
          gmail_match_method: string | null
          gmail_message_id: string | null
          gmail_sender_email: string | null
          gmail_subject: string | null
          id: string
          original_filename: string | null
          posted_at: string | null
          posted_ref: string | null
          request_id: string | null
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_type: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          was_corrected: boolean
        }
        Insert: {
          business_id?: string | null
          ca_firm_id: string
          classification?: string
          confidence?: number
          corrected?: Json | null
          correction_delta?: Json | null
          created_at?: string
          document_id?: string | null
          error_message?: string | null
          extracted?: Json
          gmail_match_confidence?: number | null
          gmail_match_method?: string | null
          gmail_message_id?: string | null
          gmail_sender_email?: string | null
          gmail_subject?: string | null
          id?: string
          original_filename?: string | null
          posted_at?: string | null
          posted_ref?: string | null
          request_id?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          was_corrected?: boolean
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string
          classification?: string
          confidence?: number
          corrected?: Json | null
          correction_delta?: Json | null
          created_at?: string
          document_id?: string | null
          error_message?: string | null
          extracted?: Json
          gmail_match_confidence?: number | null
          gmail_match_method?: string | null
          gmail_message_id?: string | null
          gmail_sender_email?: string | null
          gmail_subject?: string | null
          id?: string
          original_filename?: string | null
          posted_at?: string | null
          posted_ref?: string | null
          request_id?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          was_corrected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ca_document_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ca_client_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_document_extractions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "ca_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_document_requests: {
        Row: {
          business_id: string
          ca_firm_id: string
          chaser_count: number
          created_at: string
          doc_types: string[]
          due_date: string | null
          escalated_at: string | null
          fulfilled_at: string | null
          id: string
          last_chased_at: string | null
          notes: string | null
          period: string | null
          requested_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          chaser_count?: number
          created_at?: string
          doc_types?: string[]
          due_date?: string | null
          escalated_at?: string | null
          fulfilled_at?: string | null
          id?: string
          last_chased_at?: string | null
          notes?: string | null
          period?: string | null
          requested_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          chaser_count?: number
          created_at?: string
          doc_types?: string[]
          due_date?: string | null
          escalated_at?: string | null
          fulfilled_at?: string | null
          id?: string
          last_chased_at?: string | null
          notes?: string | null
          period?: string | null
          requested_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_document_versions: {
        Row: {
          business_id: string | null
          ca_firm_id: string
          created_at: string
          extraction_id: string | null
          id: string
          original_filename: string | null
          reason: string | null
          replaced_by: string | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          business_id?: string | null
          ca_firm_id: string
          created_at?: string
          extraction_id?: string | null
          id?: string
          original_filename?: string | null
          reason?: string | null
          replaced_by?: string | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string
          created_at?: string
          extraction_id?: string | null
          id?: string
          original_filename?: string | null
          reason?: string | null
          replaced_by?: string | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ca_document_versions_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_document_versions_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "ca_document_extractions"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_email_sender_mappings: {
        Row: {
          business_id: string
          ca_firm_id: string
          confidence: number
          confirmed_at: string | null
          confirmed_by_user_id: string | null
          created_at: string
          id: string
          match_method: string | null
          sender_domain: string | null
          sender_email: string
          sender_name: string | null
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          confidence?: number
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string
          id?: string
          match_method?: string | null
          sender_domain?: string | null
          sender_email: string
          sender_name?: string | null
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          confidence?: number
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string
          id?: string
          match_method?: string | null
          sender_domain?: string | null
          sender_email?: string
          sender_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_email_sender_mappings_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_engagements: {
        Row: {
          billing_cycle: string | null
          business_id: string
          ca_firm_id: string
          created_at: string
          end_date: string | null
          engagement_type: string
          fee_amount: number | null
          id: string
          manager_id: string | null
          name: string
          partner_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          business_id: string
          ca_firm_id: string
          created_at?: string
          end_date?: string | null
          engagement_type?: string
          fee_amount?: number | null
          id?: string
          manager_id?: string | null
          name: string
          partner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          end_date?: string | null
          engagement_type?: string
          fee_amount?: number | null
          id?: string
          manager_id?: string | null
          name?: string
          partner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_entity_groups: {
        Row: {
          ca_firm_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          parent_business_id: string | null
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          parent_business_id?: string | null
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          parent_business_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ca_exceptions: {
        Row: {
          amount: number | null
          business_id: string
          ca_firm_id: string
          created_at: string
          description: string | null
          evidence_document_id: string | null
          id: string
          owner_id: string | null
          reason_code: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          business_id: string
          ca_firm_id: string
          created_at?: string
          description?: string | null
          evidence_document_id?: string | null
          id?: string
          owner_id?: string | null
          reason_code: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          description?: string | null
          evidence_document_id?: string | null
          id?: string
          owner_id?: string | null
          reason_code?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_firm_intelligence: {
        Row: {
          ca_firm_id: string
          computed_at: string | null
          confidence_overrides: Json
          id: string
          last_deduction_learning_at: string | null
          last_filing_learning_at: string | null
          last_ocr_learning_at: string | null
          provision_weights: Json
        }
        Insert: {
          ca_firm_id: string
          computed_at?: string | null
          confidence_overrides?: Json
          id?: string
          last_deduction_learning_at?: string | null
          last_filing_learning_at?: string | null
          last_ocr_learning_at?: string | null
          provision_weights?: Json
        }
        Update: {
          ca_firm_id?: string
          computed_at?: string | null
          confidence_overrides?: Json
          id?: string
          last_deduction_learning_at?: string | null
          last_filing_learning_at?: string | null
          last_ocr_learning_at?: string | null
          provision_weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ca_firm_intelligence_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: true
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_firm_members: {
        Row: {
          billing_rate: number | null
          ca_firm_id: string
          capacity_hours_per_week: number
          cost_rate: number | null
          created_at: string | null
          id: string
          invited_email: string
          is_active: boolean | null
          role: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          billing_rate?: number | null
          ca_firm_id: string
          capacity_hours_per_week?: number
          cost_rate?: number | null
          created_at?: string | null
          id?: string
          invited_email: string
          is_active?: boolean | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          billing_rate?: number | null
          ca_firm_id?: string
          capacity_hours_per_week?: number
          cost_rate?: number | null
          created_at?: string | null
          id?: string
          invited_email?: string
          is_active?: boolean | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_firm_members_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_firms: {
        Row: {
          aadhaar_document_path: string | null
          aadhaar_last4: string | null
          brain_enabled: boolean
          brain_last_run_at: string | null
          ca_name: string | null
          city: string | null
          created_at: string | null
          email: string | null
          firm_name: string
          firm_registration_number: string | null
          icai_membership_number: string | null
          icai_membership_type: string | null
          id: string
          is_active: boolean | null
          is_demo: boolean
          is_verified: boolean | null
          logo_url: string | null
          max_clients: number | null
          membership_number: string | null
          notification_prefs: Json | null
          onboarding_step: number
          pan_number: string | null
          phone: string | null
          plan_type: string | null
          practice_certificate_path: string | null
          require_mfa: boolean
          specializations: string[] | null
          state: string | null
          updated_at: string | null
          user_id: string | null
          verification_rejected_reason: string | null
          verification_reviewed_at: string | null
          verification_status: string
          verification_submitted_at: string | null
          whatsapp_phone: string | null
          years_of_practice: number | null
        }
        Insert: {
          aadhaar_document_path?: string | null
          aadhaar_last4?: string | null
          brain_enabled?: boolean
          brain_last_run_at?: string | null
          ca_name?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          firm_name: string
          firm_registration_number?: string | null
          icai_membership_number?: string | null
          icai_membership_type?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          is_verified?: boolean | null
          logo_url?: string | null
          max_clients?: number | null
          membership_number?: string | null
          notification_prefs?: Json | null
          onboarding_step?: number
          pan_number?: string | null
          phone?: string | null
          plan_type?: string | null
          practice_certificate_path?: string | null
          require_mfa?: boolean
          specializations?: string[] | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_rejected_reason?: string | null
          verification_reviewed_at?: string | null
          verification_status?: string
          verification_submitted_at?: string | null
          whatsapp_phone?: string | null
          years_of_practice?: number | null
        }
        Update: {
          aadhaar_document_path?: string | null
          aadhaar_last4?: string | null
          brain_enabled?: boolean
          brain_last_run_at?: string | null
          ca_name?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          firm_name?: string
          firm_registration_number?: string | null
          icai_membership_number?: string | null
          icai_membership_type?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          is_verified?: boolean | null
          logo_url?: string | null
          max_clients?: number | null
          membership_number?: string | null
          notification_prefs?: Json | null
          onboarding_step?: number
          pan_number?: string | null
          phone?: string | null
          plan_type?: string | null
          practice_certificate_path?: string | null
          require_mfa?: boolean
          specializations?: string[] | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_rejected_reason?: string | null
          verification_reviewed_at?: string | null
          verification_status?: string
          verification_submitted_at?: string | null
          whatsapp_phone?: string | null
          years_of_practice?: number | null
        }
        Relationships: []
      }
      ca_follow_up_rules: {
        Row: {
          action_type: string
          ca_firm_id: string
          created_at: string
          escalate_to_role: string | null
          id: string
          is_active: boolean
          rule_name: string
          trigger_event: string
          wait_days: number
        }
        Insert: {
          action_type?: string
          ca_firm_id: string
          created_at?: string
          escalate_to_role?: string | null
          id?: string
          is_active?: boolean
          rule_name: string
          trigger_event: string
          wait_days?: number
        }
        Update: {
          action_type?: string
          ca_firm_id?: string
          created_at?: string
          escalate_to_role?: string | null
          id?: string
          is_active?: boolean
          rule_name?: string
          trigger_event?: string
          wait_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "ca_follow_up_rules_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_fx_rates: {
        Row: {
          base_currency: string
          ca_firm_id: string
          created_at: string
          created_by: string | null
          id: string
          quote_currency: string
          rate: number
          rate_date: string
          source: string
        }
        Insert: {
          base_currency: string
          ca_firm_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          quote_currency?: string
          rate: number
          rate_date: string
          source?: string
        }
        Update: {
          base_currency?: string
          ca_firm_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          quote_currency?: string
          rate?: number
          rate_date?: string
          source?: string
        }
        Relationships: []
      }
      ca_gmail_connections: {
        Row: {
          access_token_enc: string
          ca_firm_id: string
          created_at: string
          error_message: string | null
          gmail_address: string
          id: string
          is_active: boolean
          last_history_id: string | null
          last_polled_at: string | null
          refresh_locked_until: string | null
          refresh_token_enc: string
          token_expiry: string
          user_id: string
        }
        Insert: {
          access_token_enc: string
          ca_firm_id: string
          created_at?: string
          error_message?: string | null
          gmail_address: string
          id?: string
          is_active?: boolean
          last_history_id?: string | null
          last_polled_at?: string | null
          refresh_locked_until?: string | null
          refresh_token_enc: string
          token_expiry: string
          user_id: string
        }
        Update: {
          access_token_enc?: string
          ca_firm_id?: string
          created_at?: string
          error_message?: string | null
          gmail_address?: string
          id?: string
          is_active?: boolean
          last_history_id?: string | null
          last_polled_at?: string | null
          refresh_locked_until?: string | null
          refresh_token_enc?: string
          token_expiry?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_gmail_connections_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_gstr2b_uploads: {
        Row: {
          business_id: string
          ca_firm_id: string
          created_at: string
          error_message: string | null
          file_name: string
          file_size_bytes: number | null
          filing_period: string
          id: string
          processed_at: string | null
          processing_status: string
          raw_data: Json | null
          record_count: number | null
          records_matched: number
          records_mismatched: number
          records_new: number
          records_parsed: number
          uploaded_by: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          created_at?: string
          error_message?: string | null
          file_name: string
          file_size_bytes?: number | null
          filing_period: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          raw_data?: Json | null
          record_count?: number | null
          records_matched?: number
          records_mismatched?: number
          records_new?: number
          records_parsed?: number
          uploaded_by: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_size_bytes?: number | null
          filing_period?: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          raw_data?: Json | null
          record_count?: number | null
          records_matched?: number
          records_mismatched?: number
          records_new?: number
          records_parsed?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_gstr2b_uploads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_gstr2b_uploads_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_inter_entity_transactions: {
        Row: {
          amount: number
          ca_firm_id: string
          created_at: string
          created_by: string | null
          description: string | null
          elimination_status: string
          from_business_id: string
          group_id: string | null
          id: string
          nature: string
          source_reference: string | null
          to_business_id: string
          txn_date: string
        }
        Insert: {
          amount: number
          ca_firm_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          elimination_status?: string
          from_business_id: string
          group_id?: string | null
          id?: string
          nature?: string
          source_reference?: string | null
          to_business_id: string
          txn_date: string
        }
        Update: {
          amount?: number
          ca_firm_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          elimination_status?: string
          from_business_id?: string
          group_id?: string | null
          id?: string
          nature?: string
          source_reference?: string | null
          to_business_id?: string
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_inter_entity_transactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ca_entity_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_invoice_payments: {
        Row: {
          amount: number
          business_id: string
          ca_firm_id: string
          created_at: string
          id: string
          invoice_id: string
          method: string | null
          paid_at: string | null
          payment_url: string | null
          provider: string
          provider_link_id: string | null
          provider_payment_id: string | null
          raw: Json | null
          status: string
        }
        Insert: {
          amount: number
          business_id: string
          ca_firm_id: string
          created_at?: string
          id?: string
          invoice_id: string
          method?: string | null
          paid_at?: string | null
          payment_url?: string | null
          provider?: string
          provider_link_id?: string | null
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
        }
        Update: {
          amount?: number
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string | null
          paid_at?: string | null
          payment_url?: string | null
          provider?: string
          provider_link_id?: string | null
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_invoice_payments_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ca_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_invoices: {
        Row: {
          business_id: string
          ca_firm_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          engagement_id: string | null
          gst_amount: number
          gst_rate: number
          id: string
          invoice_number: string
          line_items: Json
          paid_at: string | null
          payment_ref: string | null
          period: string
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          engagement_id?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_number: string
          line_items?: Json
          paid_at?: string | null
          payment_ref?: string | null
          period: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          engagement_id?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_number?: string
          line_items?: Json
          paid_at?: string | null
          payment_ref?: string | null
          period?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_invoices_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_invoices_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "ca_engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_itc_records: {
        Row: {
          block_reason: string | null
          business_id: string
          ca_firm_id: string
          cgst_amount: number
          created_at: string
          filing_period: string
          gstin_supplier: string
          gstr2b_cgst: number | null
          gstr2b_igst: number | null
          gstr2b_matched: boolean | null
          gstr2b_sgst: number | null
          gstr2b_taxable_value: number | null
          id: string
          igst_amount: number
          invoice_date: string | null
          invoice_number: string | null
          is_demo: boolean
          itc_blocked: boolean | null
          itc_eligible: boolean | null
          match_status: string
          mismatch_amount: number | null
          sgst_amount: number
          source: string
          supplier_name: string | null
          taxable_value: number
          total_itc: number | null
          updated_at: string
        }
        Insert: {
          block_reason?: string | null
          business_id: string
          ca_firm_id: string
          cgst_amount?: number
          created_at?: string
          filing_period: string
          gstin_supplier: string
          gstr2b_cgst?: number | null
          gstr2b_igst?: number | null
          gstr2b_matched?: boolean | null
          gstr2b_sgst?: number | null
          gstr2b_taxable_value?: number | null
          id?: string
          igst_amount?: number
          invoice_date?: string | null
          invoice_number?: string | null
          is_demo?: boolean
          itc_blocked?: boolean | null
          itc_eligible?: boolean | null
          match_status?: string
          mismatch_amount?: number | null
          sgst_amount?: number
          source?: string
          supplier_name?: string | null
          taxable_value?: number
          total_itc?: number | null
          updated_at?: string
        }
        Update: {
          block_reason?: string | null
          business_id?: string
          ca_firm_id?: string
          cgst_amount?: number
          created_at?: string
          filing_period?: string
          gstin_supplier?: string
          gstr2b_cgst?: number | null
          gstr2b_igst?: number | null
          gstr2b_matched?: boolean | null
          gstr2b_sgst?: number | null
          gstr2b_taxable_value?: number | null
          id?: string
          igst_amount?: number
          invoice_date?: string | null
          invoice_number?: string | null
          is_demo?: boolean
          itc_blocked?: boolean | null
          itc_eligible?: boolean | null
          match_status?: string
          mismatch_amount?: number | null
          sgst_amount?: number
          source?: string
          supplier_name?: string | null
          taxable_value?: number
          total_itc?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_itc_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_itc_records_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_items: {
        Row: {
          business_id: string
          ca_firm_id: string
          category: string | null
          created_at: string
          gst_rate: number
          hsn_code: string | null
          id: string
          is_active: boolean
          name: string
          sku: string | null
          unit_price: number | null
          uom: string
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          category?: string | null
          created_at?: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          sku?: string | null
          unit_price?: number | null
          uom?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          category?: string | null
          created_at?: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sku?: string | null
          unit_price?: number | null
          uom?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_ledger_accounts: {
        Row: {
          account_type: string
          business_id: string
          ca_firm_id: string
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_group: boolean
          name: string
          opening_balance: number
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          business_id: string
          ca_firm_id: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          name: string
          opening_balance?: number
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          business_id?: string
          ca_firm_id?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          name?: string
          opening_balance?: number
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_ledger_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ca_ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_mis_signoffs: {
        Row: {
          ca_firm_id: string
          client_id: string | null
          created_at: string
          id: string
          notes: string | null
          period_id: string | null
          report_type: string
          signed_off_at: string
          signed_off_by: string
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_id?: string | null
          report_type?: string
          signed_off_at?: string
          signed_off_by: string
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_id?: string | null
          report_type?: string
          signed_off_at?: string
          signed_off_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_mis_signoffs_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_mis_signoffs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_notification_outbox: {
        Row: {
          attempts: number
          business_id: string | null
          ca_firm_id: string
          channel: string
          created_at: string
          dedupe_key: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          provider: string | null
          provider_message_id: string | null
          recipient: string | null
          sent_at: string | null
          status: string
          template: string
        }
        Insert: {
          attempts?: number
          business_id?: string | null
          ca_firm_id: string
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          status?: string
          template: string
        }
        Update: {
          attempts?: number
          business_id?: string | null
          ca_firm_id?: string
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string | null
          sent_at?: string | null
          status?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_notification_outbox_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_notifications: {
        Row: {
          business_id: string | null
          ca_firm_id: string
          compliance_event_id: string | null
          created_at: string | null
          id: string
          is_demo: boolean
          is_read: boolean | null
          message: string
          metadata: Json
          severity: string | null
          title: string
          type: string
        }
        Insert: {
          business_id?: string | null
          ca_firm_id: string
          compliance_event_id?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean
          is_read?: boolean | null
          message: string
          metadata?: Json
          severity?: string | null
          title: string
          type: string
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string
          compliance_event_id?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean
          is_read?: boolean | null
          message?: string
          metadata?: Json
          severity?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_notifications_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_notifications_compliance_event_id_fkey"
            columns: ["compliance_event_id"]
            isOneToOne: false
            referencedRelation: "ca_compliance_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_parties: {
        Row: {
          address: string | null
          business_id: string
          ca_firm_id: string
          created_at: string
          credit_limit: number | null
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          pan: string | null
          party_type: string
          payment_terms_days: number
          phone: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          ca_firm_id: string
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          pan?: string | null
          party_type?: string
          payment_terms_days?: number
          phone?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          pan?: string | null
          party_type?: string
          payment_terms_days?: number
          phone?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ca_recon_runs: {
        Row: {
          business_id: string
          ca_firm_id: string
          created_at: string
          id: string
          matched: number
          mismatched: number
          period: string
          recon_type: string
          run_at: string
          run_by: string | null
          snapshot: Json | null
          total_at_risk: number
          total_items: number
          total_matched_value: number
          unmatched: number
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          created_at?: string
          id?: string
          matched?: number
          mismatched?: number
          period: string
          recon_type: string
          run_at?: string
          run_by?: string | null
          snapshot?: Json | null
          total_at_risk?: number
          total_items?: number
          total_matched_value?: number
          unmatched?: number
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          id?: string
          matched?: number
          mismatched?: number
          period?: string
          recon_type?: string
          run_at?: string
          run_by?: string | null
          snapshot?: Json | null
          total_at_risk?: number
          total_items?: number
          total_matched_value?: number
          unmatched?: number
        }
        Relationships: [
          {
            foreignKeyName: "ca_recon_runs_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_reminders: {
        Row: {
          business_id: string | null
          ca_firm_id: string
          created_at: string
          created_by: string | null
          done_at: string | null
          id: string
          is_done: boolean
          linked_entity_id: string | null
          linked_entity_type: string | null
          notes: string | null
          remind_at: string
          title: string
        }
        Insert: {
          business_id?: string | null
          ca_firm_id: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          is_done?: boolean
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          notes?: string | null
          remind_at: string
          title: string
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          is_done?: boolean
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          notes?: string | null
          remind_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_reminders_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_report_schedules: {
        Row: {
          ca_firm_id: string
          clients: Json | null
          created_at: string
          day_of_month: number | null
          delivery: Json | null
          frequency: string
          id: string
          is_active: boolean | null
          last_generated_at: string | null
          next_generation_at: string | null
          report_name: string | null
          report_type: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          clients?: Json | null
          created_at?: string
          day_of_month?: number | null
          delivery?: Json | null
          frequency: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_generation_at?: string | null
          report_name?: string | null
          report_type: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          clients?: Json | null
          created_at?: string
          day_of_month?: number | null
          delivery?: Json | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_generation_at?: string | null
          report_name?: string | null
          report_type?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ca_report_shares: {
        Row: {
          business_id: string
          ca_firm_id: string
          created_at: string
          expires_at: string | null
          id: string
          note: string | null
          report_log_id: string
          revoked_at: string | null
          share_token: string | null
          share_url: string | null
          shared_by: string | null
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          report_log_id: string
          revoked_at?: string | null
          share_token?: string | null
          share_url?: string | null
          shared_by?: string | null
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          report_log_id?: string
          revoked_at?: string | null
          share_token?: string | null
          share_url?: string | null
          shared_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_report_shares_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_report_shares_report_log_id_fkey"
            columns: ["report_log_id"]
            isOneToOne: true
            referencedRelation: "ca_reports_log"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_reports_log: {
        Row: {
          business_id: string | null
          ca_firm_id: string
          content: Json | null
          created_at: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          generated_by_user_id: string | null
          id: string
          period: string | null
          period_end: string | null
          period_start: string | null
          report_name: string | null
          report_type: string
          sent_to: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          status: string | null
        }
        Insert: {
          business_id?: string | null
          ca_firm_id: string
          content?: Json | null
          created_at?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          generated_by_user_id?: string | null
          id?: string
          period?: string | null
          period_end?: string | null
          period_start?: string | null
          report_name?: string | null
          report_type: string
          sent_to?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string | null
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string
          content?: Json | null
          created_at?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          generated_by_user_id?: string | null
          id?: string
          period?: string | null
          period_end?: string | null
          period_start?: string | null
          report_name?: string | null
          report_type?: string
          sent_to?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_reports_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_reports_log_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role?: string
        }
        Relationships: []
      }
      ca_source_field_map: {
        Row: {
          canonical_field_id: string | null
          created_at: string
          id: string
          source_field: string
          source_system: string
          transform_rule: string | null
        }
        Insert: {
          canonical_field_id?: string | null
          created_at?: string
          id?: string
          source_field: string
          source_system: string
          transform_rule?: string | null
        }
        Update: {
          canonical_field_id?: string | null
          created_at?: string
          id?: string
          source_field?: string
          source_system?: string
          transform_rule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_source_field_map_canonical_field_id_fkey"
            columns: ["canonical_field_id"]
            isOneToOne: false
            referencedRelation: "ca_canonical_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_sync_jobs: {
        Row: {
          business_id: string
          ca_firm_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          last_sync_cursor: string | null
          records_synced: number
          source_system: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_cursor?: string | null
          records_synced?: number
          source_system: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_sync_cursor?: string | null
          records_synced?: number
          source_system?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_sync_jobs_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_tasks: {
        Row: {
          assigned_to: string | null
          business_id: string | null
          ca_firm_id: string
          category: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          engagement_id: string | null
          id: string
          priority: string
          sla_hours: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          business_id?: string | null
          ca_firm_id: string
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          engagement_id?: string | null
          id?: string
          priority?: string
          sla_hours?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          business_id?: string | null
          ca_firm_id?: string
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          engagement_id?: string | null
          id?: string
          priority?: string
          sla_hours?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_tasks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "ca_engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_tds_records: {
        Row: {
          business_id: string
          ca_firm_id: string
          challan_date: string | null
          challan_number: string | null
          created_at: string
          deductee_name: string
          deductee_pan: string | null
          deposited_amount: number | null
          financial_year: string
          id: string
          interest_amount: number | null
          is_demo: boolean
          payment_amount: number
          payment_date: string | null
          penalty_amount: number | null
          quarter: string
          return_filed: boolean | null
          return_filed_date: string | null
          section_code: string
          status: string
          tds_amount: number
          tds_rate: number
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          challan_date?: string | null
          challan_number?: string | null
          created_at?: string
          deductee_name: string
          deductee_pan?: string | null
          deposited_amount?: number | null
          financial_year: string
          id?: string
          interest_amount?: number | null
          is_demo?: boolean
          payment_amount?: number
          payment_date?: string | null
          penalty_amount?: number | null
          quarter: string
          return_filed?: boolean | null
          return_filed_date?: string | null
          section_code: string
          status?: string
          tds_amount?: number
          tds_rate?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          challan_date?: string | null
          challan_number?: string | null
          created_at?: string
          deductee_name?: string
          deductee_pan?: string | null
          deposited_amount?: number | null
          financial_year?: string
          id?: string
          interest_amount?: number | null
          is_demo?: boolean
          payment_amount?: number
          payment_date?: string | null
          penalty_amount?: number | null
          quarter?: string
          return_filed?: boolean | null
          return_filed_date?: string | null
          section_code?: string
          status?: string
          tds_amount?: number
          tds_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_tds_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_tds_records_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_time_entries: {
        Row: {
          billable: boolean
          business_id: string | null
          ca_firm_id: string
          created_at: string
          ended_at: string | null
          engagement_id: string | null
          entry_date: string
          id: string
          member_user_id: string
          minutes: number
          note: string | null
          started_at: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          billable?: boolean
          business_id?: string | null
          ca_firm_id: string
          created_at?: string
          ended_at?: string | null
          engagement_id?: string | null
          entry_date?: string
          id?: string
          member_user_id: string
          minutes?: number
          note?: string | null
          started_at?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          billable?: boolean
          business_id?: string | null
          ca_firm_id?: string
          created_at?: string
          ended_at?: string | null
          engagement_id?: string | null
          entry_date?: string
          id?: string
          member_user_id?: string
          minutes?: number
          note?: string | null
          started_at?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_time_entries_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_time_entries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "ca_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ca_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_verification_documents: {
        Row: {
          ca_firm_id: string
          document_type: string
          file_size_bytes: number | null
          id: string
          original_filename: string
          storage_path: string
          uploaded_at: string
          verified: boolean | null
        }
        Insert: {
          ca_firm_id: string
          document_type: string
          file_size_bytes?: number | null
          id?: string
          original_filename: string
          storage_path: string
          uploaded_at?: string
          verified?: boolean | null
        }
        Update: {
          ca_firm_id?: string
          document_type?: string
          file_size_bytes?: number | null
          id?: string
          original_filename?: string
          storage_path?: string
          uploaded_at?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_verification_documents_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_working_papers: {
        Row: {
          business_id: string
          ca_firm_id: string
          close_period_id: string | null
          content: Json
          created_at: string
          id: string
          paper_type: string
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          ca_firm_id: string
          close_period_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          paper_type?: string
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          ca_firm_id?: string
          close_period_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          paper_type?: string
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_working_papers_close_period_id_fkey"
            columns: ["close_period_id"]
            isOneToOne: false
            referencedRelation: "ca_close_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      callback_requests: {
        Row: {
          created_at: string
          id: string
          name: string | null
          notes: string | null
          phone: string
          source: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cash_flow_trends: {
        Row: {
          business_id: string
          created_at: string
          id: string
          money_in: number
          money_out: number
          net_cash: number
          period_label: string
          period_start: string
          period_type: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          money_in?: number
          money_out?: number
          net_cash?: number
          period_label: string
          period_start: string
          period_type?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          money_in?: number
          money_out?: number
          net_cash?: number
          period_label?: string
          period_start?: string
          period_type?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          avg_payment_days: number | null
          business_id: string
          city: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          credit_risk: string | null
          gstin: string | null
          id: string
          industry: string | null
          is_demo: boolean
          name: string
          outstanding_amount: number
          state: string | null
          total_revenue: number
          updated_at: string
        }
        Insert: {
          avg_payment_days?: number | null
          business_id: string
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          credit_risk?: string | null
          gstin?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          name: string
          outstanding_amount?: number
          state?: string | null
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          avg_payment_days?: number | null
          business_id?: string
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          credit_risk?: string | null
          gstin?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          name?: string
          outstanding_amount?: number
          state?: string | null
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      cohort_data: {
        Row: {
          business_id: string
          cohort_month: string
          customers_churned: number
          id: string
          is_demo: boolean
          month_number: number
          nrr: number
          retention_rate: number
          revenue_current: number
        }
        Insert: {
          business_id: string
          cohort_month: string
          customers_churned?: number
          id?: string
          is_demo?: boolean
          month_number: number
          nrr?: number
          retention_rate?: number
          revenue_current?: number
        }
        Update: {
          business_id?: string
          cohort_month?: string
          customers_churned?: number
          id?: string
          is_demo?: boolean
          month_number?: number
          nrr?: number
          retention_rate?: number
          revenue_current?: number
        }
        Relationships: []
      }
      compensation_benchmarks: {
        Row: {
          business_id: string
          competitiveness: string
          department: string | null
          id: string
          internal_ctc: number
          is_demo: boolean
          market_25th: number
          market_50th: number
          market_75th: number
          market_90th: number
          percentile_position: number
          role: string
        }
        Insert: {
          business_id: string
          competitiveness?: string
          department?: string | null
          id?: string
          internal_ctc?: number
          is_demo?: boolean
          market_25th?: number
          market_50th?: number
          market_75th?: number
          market_90th?: number
          percentile_position?: number
          role: string
        }
        Update: {
          business_id?: string
          competitiveness?: string
          department?: string | null
          id?: string
          internal_ctc?: number
          is_demo?: boolean
          market_25th?: number
          market_50th?: number
          market_75th?: number
          market_90th?: number
          percentile_position?: number
          role?: string
        }
        Relationships: []
      }
      compliance_events: {
        Row: {
          business_id: string
          created_at: string
          due_date: string
          filing_name: string
          filing_type: string
          id: string
          notes: string | null
          status: string | null
          urgency: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          due_date: string
          filing_name: string
          filing_type: string
          id?: string
          notes?: string | null
          status?: string | null
          urgency?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          due_date?: string
          filing_name?: string
          filing_type?: string
          id?: string
          notes?: string | null
          status?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_renewals: {
        Row: {
          annual_value: number
          auto_renew: boolean
          business_id: string
          end_date: string | null
          id: string
          is_demo: boolean
          renewal_date: string | null
          vendor_name: string
        }
        Insert: {
          annual_value?: number
          auto_renew?: boolean
          business_id: string
          end_date?: string | null
          id?: string
          is_demo?: boolean
          renewal_date?: string | null
          vendor_name: string
        }
        Update: {
          annual_value?: number
          auto_renew?: boolean
          business_id?: string
          end_date?: string | null
          id?: string
          is_demo?: boolean
          renewal_date?: string | null
          vendor_name?: string
        }
        Relationships: []
      }
      conversion_funnel: {
        Row: {
          activated: number
          activation_rate: number
          avg_days_to_convert: number
          best_channel: string | null
          business_id: string
          converted_to_paid: number
          created_at: string
          id: string
          is_demo: boolean
          leads_total: number
          period_start: string
          retained_90d: number
          trial_to_paid_rate: number
          trials_started: number
          worst_channel: string | null
        }
        Insert: {
          activated?: number
          activation_rate?: number
          avg_days_to_convert?: number
          best_channel?: string | null
          business_id: string
          converted_to_paid?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          leads_total?: number
          period_start: string
          retained_90d?: number
          trial_to_paid_rate?: number
          trials_started?: number
          worst_channel?: string | null
        }
        Update: {
          activated?: number
          activation_rate?: number
          avg_days_to_convert?: number
          best_channel?: string | null
          business_id?: string
          converted_to_paid?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          leads_total?: number
          period_start?: string
          retained_90d?: number
          trial_to_paid_rate?: number
          trials_started?: number
          worst_channel?: string | null
        }
        Relationships: []
      }
      csv_uploads: {
        Row: {
          business_id: string
          created_at: string
          error_message: string | null
          file_hash: string | null
          file_name: string
          file_size: number
          id: string
          max_date: string | null
          min_date: string | null
          row_count: number
          source_type: string
          status: string
          upload_type: string
          uploaded_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          error_message?: string | null
          file_hash?: string | null
          file_name: string
          file_size?: number
          id?: string
          max_date?: string | null
          min_date?: string | null
          row_count?: number
          source_type?: string
          status?: string
          upload_type: string
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          error_message?: string | null
          file_hash?: string | null
          file_name?: string
          file_size?: number
          id?: string
          max_date?: string | null
          min_date?: string | null
          row_count?: number
          source_type?: string
          status?: string
          upload_type?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      customer_acquisition_costs: {
        Row: {
          business_id: string
          cac: number
          created_at: string
          id: string
          is_demo: boolean
          ltv_cac_ratio: number
          magic_number: number
          payback_months: number
          period_start: string
        }
        Insert: {
          business_id: string
          cac?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          ltv_cac_ratio?: number
          magic_number?: number
          payback_months?: number
          period_start: string
        }
        Update: {
          business_id?: string
          cac?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          ltv_cac_ratio?: number
          magic_number?: number
          payback_months?: number
          period_start?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          business_id: string
          city: string | null
          contact_person: string | null
          created_at: string
          customer_category: string | null
          customer_name: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          payment_terms_days: number | null
          phone: string | null
          state: string | null
          total_receivable: number
          updated_at: string
        }
        Insert: {
          business_id: string
          city?: string | null
          contact_person?: string | null
          created_at?: string
          customer_category?: string | null
          customer_name: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          payment_terms_days?: number | null
          phone?: string | null
          state?: string | null
          total_receivable?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          city?: string | null
          contact_person?: string | null
          created_at?: string
          customer_category?: string | null
          customer_name?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          payment_terms_days?: number | null
          phone?: string | null
          state?: string | null
          total_receivable?: number
          updated_at?: string
        }
        Relationships: []
      }
      deferred_revenue: {
        Row: {
          business_id: string
          collected: number
          contract_value: number
          customer_name: string
          deferred_balance: number
          id: string
          is_demo: boolean
          monthly_recognition: number
          recognition_method: string | null
          recognized: number
          unbilled_revenue: number
        }
        Insert: {
          business_id: string
          collected?: number
          contract_value?: number
          customer_name: string
          deferred_balance?: number
          id?: string
          is_demo?: boolean
          monthly_recognition?: number
          recognition_method?: string | null
          recognized?: number
          unbilled_revenue?: number
        }
        Update: {
          business_id?: string
          collected?: number
          contract_value?: number
          customer_name?: string
          deferred_balance?: number
          id?: string
          is_demo?: boolean
          monthly_recognition?: number
          recognition_method?: string | null
          recognized?: number
          unbilled_revenue?: number
        }
        Relationships: []
      }
      demo_insights: {
        Row: {
          created_at: string
          data: Json
          id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          org_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          org_id?: string
        }
        Relationships: []
      }
      demo_organizations: {
        Row: {
          business_name: string
          challenge: string | null
          created_at: string
          demo_org_id: string
          email: string | null
          employees: string | null
          id: string
          industry: string | null
          metadata: Json
          monthly_revenue: string | null
          name: string | null
        }
        Insert: {
          business_name: string
          challenge?: string | null
          created_at?: string
          demo_org_id: string
          email?: string | null
          employees?: string | null
          id?: string
          industry?: string | null
          metadata?: Json
          monthly_revenue?: string | null
          name?: string | null
        }
        Update: {
          business_name?: string
          challenge?: string | null
          created_at?: string
          demo_org_id?: string
          email?: string | null
          employees?: string | null
          id?: string
          industry?: string | null
          metadata?: Json
          monthly_revenue?: string | null
          name?: string | null
        }
        Relationships: []
      }
      demo_transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          customer: string | null
          date: string
          description: string
          gst_amount: number | null
          id: string
          invoice_number: string | null
          metadata: Json | null
          organization_id: string
          payment_method: string | null
          type: string
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          customer?: string | null
          date: string
          description: string
          gst_amount?: number | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          organization_id: string
          payment_method?: string | null
          type: string
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          customer?: string | null
          date?: string
          description?: string
          gst_amount?: number | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          organization_id?: string
          payment_method?: string | null
          type?: string
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      early_access_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          requested_module: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          requested_module: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          requested_module?: string
          user_id?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          business_id: string
          created_at: string
          ctc_annual: number | null
          date_of_exit: string | null
          date_of_joining: string | null
          department: string | null
          designation: string | null
          email: string | null
          esic_number: string | null
          id: string
          metadata: Json | null
          name: string
          pf_number: string | null
          salary_monthly: number | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          ctc_annual?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          esic_number?: string | null
          id?: string
          metadata?: Json | null
          name: string
          pf_number?: string | null
          salary_monthly?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          ctc_annual?: number | null
          date_of_exit?: string | null
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          esic_number?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          pf_number?: string | null
          salary_monthly?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees_demo: {
        Row: {
          business_id: string
          cost_to_company: number
          created_at: string
          department: string | null
          designation: string | null
          id: string
          is_demo: boolean
          joining_date: string | null
          name: string
          salary: number
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_to_company?: number
          created_at?: string
          department?: string | null
          designation?: string | null
          id?: string
          is_demo?: boolean
          joining_date?: string | null
          name: string
          salary?: number
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_to_company?: number
          created_at?: string
          department?: string | null
          designation?: string | null
          id?: string
          is_demo?: boolean
          joining_date?: string | null
          name?: string
          salary?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      esop_grants: {
        Row: {
          business_id: string
          cliff_date: string | null
          current_fair_value: number
          employee_name: string
          grant_date: string
          id: string
          is_demo: boolean
          status: string
          strike_price: number
          total_options: number
          vested_options: number
        }
        Insert: {
          business_id: string
          cliff_date?: string | null
          current_fair_value?: number
          employee_name: string
          grant_date: string
          id?: string
          is_demo?: boolean
          status?: string
          strike_price?: number
          total_options?: number
          vested_options?: number
        }
        Update: {
          business_id?: string
          cliff_date?: string | null
          current_fair_value?: number
          employee_name?: string
          grant_date?: string
          id?: string
          is_demo?: boolean
          status?: string
          strike_price?: number
          total_options?: number
          vested_options?: number
        }
        Relationships: []
      }
      eway_bills: {
        Row: {
          bill_number: string
          business_id: string
          document_date: string
          from_location: string | null
          id: string
          invoice_number: string | null
          is_compliant: boolean
          is_demo: boolean
          status: string
          to_location: string | null
          value: number
        }
        Insert: {
          bill_number: string
          business_id: string
          document_date: string
          from_location?: string | null
          id?: string
          invoice_number?: string | null
          is_compliant?: boolean
          is_demo?: boolean
          status?: string
          to_location?: string | null
          value?: number
        }
        Update: {
          bill_number?: string
          business_id?: string
          document_date?: string
          from_location?: string | null
          id?: string
          invoice_number?: string | null
          is_compliant?: boolean
          is_demo?: boolean
          status?: string
          to_location?: string | null
          value?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: string | null
          created_at: string
          date: string
          description: string | null
          due_date: string | null
          id: string
          is_demo: boolean
          payment_method: string | null
          payment_status: string
          subcategory: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amount?: number
          business_id: string
          category?: string | null
          created_at?: string
          date: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_demo?: boolean
          payment_method?: string | null
          payment_status?: string
          subcategory?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          category?: string | null
          created_at?: string
          date?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_demo?: boolean
          payment_method?: string | null
          payment_status?: string
          subcategory?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          display_name: string | null
          enabled: boolean
          flag_name: string
          id: string
          rollout_percentage: number
          target_segment: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          enabled?: boolean
          flag_name: string
          id?: string
          rollout_percentage?: number
          target_segment?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          enabled?: boolean
          flag_name?: string
          id?: string
          rollout_percentage?: number
          target_segment?: string
          updated_at?: string
        }
        Relationships: []
      }
      fx_exposure: {
        Row: {
          business_id: string
          created_at: string
          currency: string
          exchange_rate: number
          exposure_type: string
          hedged: boolean
          id: string
          is_demo: boolean
          monthly_amount_inr: number
          vendor_or_client: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          currency?: string
          exchange_rate?: number
          exposure_type: string
          hedged?: boolean
          id?: string
          is_demo?: boolean
          monthly_amount_inr?: number
          vendor_or_client?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          currency?: string
          exchange_rate?: number
          exposure_type?: string
          hedged?: boolean
          id?: string
          is_demo?: boolean
          monthly_amount_inr?: number
          vendor_or_client?: string | null
        }
        Relationships: []
      }
      fynny_briefs: {
        Row: {
          brief_date: string
          business_id: string
          content: string
          created_at: string
          delivered: boolean | null
          id: string
        }
        Insert: {
          brief_date?: string
          business_id: string
          content: string
          created_at?: string
          delivered?: boolean | null
          id?: string
        }
        Update: {
          brief_date?: string
          business_id?: string
          content?: string
          created_at?: string
          delivered?: boolean | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fynny_briefs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          business_id: string
          created_at: string
          file_size: number | null
          file_url: string | null
          generated_at: string
          generated_by: string | null
          id: string
          is_demo: boolean
          parameters: Json
          report_name: string
          report_type: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          file_size?: number | null
          file_url?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_demo?: boolean
          parameters?: Json
          report_name: string
          report_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          file_size?: number | null
          file_url?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_demo?: boolean
          parameters?: Json
          report_name?: string
          report_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      glossary_terms: {
        Row: {
          category: string
          created_at: string
          definition: string
          id: string
          is_published: boolean
          sort_order: number
          term: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          definition: string
          id?: string
          is_published?: boolean
          sort_order?: number
          term: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          definition?: string
          id?: string
          is_published?: boolean
          sort_order?: number
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      gst_filings: {
        Row: {
          acknowledgement_number: string | null
          arn_number: string | null
          business_id: string
          created_at: string
          due_date: string
          filed_date: string | null
          filing_period: string
          id: string
          input_tax_credit: number | null
          notes: string | null
          output_tax: number | null
          return_type: string
          status: string
          tax_payable: number | null
          taxable_sales: number | null
          updated_at: string
        }
        Insert: {
          acknowledgement_number?: string | null
          arn_number?: string | null
          business_id: string
          created_at?: string
          due_date: string
          filed_date?: string | null
          filing_period: string
          id?: string
          input_tax_credit?: number | null
          notes?: string | null
          output_tax?: number | null
          return_type: string
          status?: string
          tax_payable?: number | null
          taxable_sales?: number | null
          updated_at?: string
        }
        Update: {
          acknowledgement_number?: string | null
          arn_number?: string | null
          business_id?: string
          created_at?: string
          due_date?: string
          filed_date?: string | null
          filing_period?: string
          id?: string
          input_tax_credit?: number | null
          notes?: string | null
          output_tax?: number | null
          return_type?: string
          status?: string
          tax_payable?: number | null
          taxable_sales?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      gst_filings_demo: {
        Row: {
          business_id: string
          created_at: string
          due_date: string | null
          filed_date: string | null
          filing_type: string
          id: string
          is_demo: boolean
          itc_claimed: number
          net_payable: number
          period: string
          status: string
          tax_liability: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          due_date?: string | null
          filed_date?: string | null
          filing_type: string
          id?: string
          is_demo?: boolean
          itc_claimed?: number
          net_payable?: number
          period: string
          status?: string
          tax_liability?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          due_date?: string | null
          filed_date?: string | null
          filing_type?: string
          id?: string
          is_demo?: boolean
          itc_claimed?: number
          net_payable?: number
          period?: string
          status?: string
          tax_liability?: number
          updated_at?: string
        }
        Relationships: []
      }
      gst_itc_lines: {
        Row: {
          business_id: string
          created_at: string
          id: string
          itc_at_risk: number | null
          itc_safe: number | null
          mismatch_count: number | null
          period: string
          status: string | null
          vendor_gstin: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          itc_at_risk?: number | null
          itc_safe?: number | null
          mismatch_count?: number | null
          period: string
          status?: string | null
          vendor_gstin?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          itc_at_risk?: number | null
          itc_safe?: number | null
          mismatch_count?: number | null
          period?: string
          status?: string | null
          vendor_gstin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gst_itc_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_notice_risk_scores: {
        Row: {
          business_id: string
          computed_at: string
          factors: Json | null
          id: string
          score: number
        }
        Insert: {
          business_id: string
          computed_at?: string
          factors?: Json | null
          id?: string
          score?: number
        }
        Update: {
          business_id?: string
          computed_at?: string
          factors?: Json | null
          id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "gst_notice_risk_scores_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_pipeline: {
        Row: {
          budget: number
          business_id: string
          candidates_count: number
          department: string | null
          id: string
          is_demo: boolean
          position: string
          priority: string
          status: string
          target_join_date: string | null
        }
        Insert: {
          budget?: number
          business_id: string
          candidates_count?: number
          department?: string | null
          id?: string
          is_demo?: boolean
          position: string
          priority?: string
          status?: string
          target_join_date?: string | null
        }
        Update: {
          budget?: number
          business_id?: string
          candidates_count?: number
          department?: string | null
          id?: string
          is_demo?: boolean
          position?: string
          priority?: string
          status?: string
          target_join_date?: string | null
        }
        Relationships: []
      }
      hsn_master: {
        Row: {
          business_id: string
          code: string
          code_type: string
          description: string
          gst_rate: number
          id: string
          is_demo: boolean
          usage_count: number
          validation_status: string
        }
        Insert: {
          business_id: string
          code: string
          code_type?: string
          description: string
          gst_rate?: number
          id?: string
          is_demo?: boolean
          usage_count?: number
          validation_status?: string
        }
        Update: {
          business_id?: string
          code?: string
          code_type?: string
          description?: string
          gst_rate?: number
          id?: string
          is_demo?: boolean
          usage_count?: number
          validation_status?: string
        }
        Relationships: []
      }
      insurance_policies: {
        Row: {
          annual_premium: number
          business_id: string
          coverage_amount: number
          expiry_date: string | null
          id: string
          is_adequate: boolean
          is_demo: boolean
          policy_type: string
          provider: string
          status: string
        }
        Insert: {
          annual_premium?: number
          business_id: string
          coverage_amount?: number
          expiry_date?: string | null
          id?: string
          is_adequate?: boolean
          is_demo?: boolean
          policy_type: string
          provider: string
          status?: string
        }
        Update: {
          annual_premium?: number
          business_id?: string
          coverage_amount?: number
          expiry_date?: string | null
          id?: string
          is_adequate?: boolean
          is_demo?: boolean
          policy_type?: string
          provider?: string
          status?: string
        }
        Relationships: []
      }
      integration_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          nonce: string
          organization_id: string
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          nonce: string
          organization_id: string
          provider: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          nonce?: string
          organization_id?: string
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_tokens: {
        Row: {
          access_token: string | null
          config: Json | null
          created_at: string
          expires_at: string | null
          id: string
          platform: string
          refresh_token: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          config?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          platform: string
          refresh_token?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          config?: Json | null
          created_at?: string
          expires_at?: string | null
          id?: string
          platform?: string
          refresh_token?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          access_token: string | null
          auto_sync_enabled: boolean
          auto_sync_frequency: string
          created_at: string | null
          expires_at: string | null
          id: string
          last_auto_sync_at: string | null
          metadata: Json | null
          organization_id: string
          provider: string
          refresh_token: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          auto_sync_enabled?: boolean
          auto_sync_frequency?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_auto_sync_at?: string | null
          metadata?: Json | null
          organization_id: string
          provider: string
          refresh_token?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          auto_sync_enabled?: boolean
          auto_sync_frequency?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_auto_sync_at?: string | null
          metadata?: Json | null
          organization_id?: string
          provider?: string
          refresh_token?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      investor_manual_metrics: {
        Row: {
          business_id: string
          id: string
          metric_name: string
          updated_at: string
          value: string | null
        }
        Insert: {
          business_id: string
          id?: string
          metric_name: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          metric_name?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_manual_metrics_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          is_demo: boolean
          outstanding_amount: number
          paid_amount: number
          payment_date: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          is_demo?: boolean
          outstanding_amount?: number
          paid_amount?: number
          payment_date?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          is_demo?: boolean
          outstanding_amount?: number
          paid_amount?: number
          payment_date?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidity_metrics: {
        Row: {
          burn_rate_current: number
          business_id: string
          cash_position: number
          created_at: string
          health_score: number
          health_status: string
          id: string
          recorded_at: string
          runway_days: number
          runway_months: number
          updated_at: string
        }
        Insert: {
          burn_rate_current?: number
          business_id: string
          cash_position?: number
          created_at?: string
          health_score?: number
          health_status?: string
          id?: string
          recorded_at?: string
          runway_days?: number
          runway_months?: number
          updated_at?: string
        }
        Update: {
          burn_rate_current?: number
          business_id?: string
          cash_position?: number
          created_at?: string
          health_score?: number
          health_status?: string
          id?: string
          recorded_at?: string
          runway_days?: number
          runway_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          file_hash: string | null
          file_name: string
          file_path: string
          folder: string
          height: number | null
          id: string
          mime_type: string | null
          public_url: string
          size_bytes: number | null
          updated_at: string
          uploaded_by: string | null
          used_in: string[]
          version: number
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_hash?: string | null
          file_name: string
          file_path: string
          folder?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          public_url: string
          size_bytes?: number | null
          updated_at?: string
          uploaded_by?: string | null
          used_in?: string[]
          version?: number
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_hash?: string | null
          file_name?: string
          file_path?: string
          folder?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          public_url?: string
          size_bytes?: number | null
          updated_at?: string
          uploaded_by?: string | null
          used_in?: string[]
          version?: number
          width?: number | null
        }
        Relationships: []
      }
      nidhi_briefs: {
        Row: {
          brief_date: string
          business_id: string
          content: string
          created_at: string
          delivered: boolean | null
          id: string
        }
        Insert: {
          brief_date?: string
          business_id: string
          content: string
          created_at?: string
          delivered?: boolean | null
          id?: string
        }
        Update: {
          brief_date?: string
          business_id?: string
          content?: string
          created_at?: string
          delivered?: boolean | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nidhi_briefs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      nidhi_conversations: {
        Row: {
          business_id: string
          content: string
          created_at: string
          id: string
          language: string | null
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          content: string
          created_at?: string
          id?: string
          language?: string | null
          role: string
          user_id: string
        }
        Update: {
          business_id?: string
          content?: string
          created_at?: string
          id?: string
          language?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nidhi_conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payables: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string | null
          outstanding: number | null
          paid: number | null
          status: string | null
          vendor_name: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          outstanding?: number | null
          paid?: number | null
          status?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          outstanding?: number | null
          paid?: number | null
          status?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "payables_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlements: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          expected_date: string | null
          gateway: string
          id: string
          is_demo: boolean
          status: string
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          expected_date?: string | null
          gateway: string
          id?: string
          is_demo?: boolean
          status?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          expected_date?: string | null
          gateway?: string
          id?: string
          is_demo?: boolean
          status?: string
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          business_id: string
          created_at: string
          esic_due: number | null
          headcount: number | null
          id: string
          month: string
          next_payroll_date: string | null
          pf_due: number | null
          total_payroll: number | null
        }
        Insert: {
          business_id: string
          created_at?: string
          esic_due?: number | null
          headcount?: number | null
          id?: string
          month: string
          next_payroll_date?: string | null
          pf_due?: number | null
          total_payroll?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string
          esic_due?: number | null
          headcount?: number | null
          id?: string
          month?: string
          next_payroll_date?: string | null
          pf_due?: number | null
          total_payroll?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_snapshots: {
        Row: {
          business_id: string
          created_at: string
          employee_count: number | null
          esic_total: number | null
          id: string
          month: string
          pf_total: number | null
          processed_date: string | null
          tds_total: number | null
          total_deductions: number | null
          total_gross: number | null
          total_net: number | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          employee_count?: number | null
          esic_total?: number | null
          id?: string
          month: string
          pf_total?: number | null
          processed_date?: string | null
          tds_total?: number | null
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          employee_count?: number | null
          esic_total?: number | null
          id?: string
          month?: string
          pf_total?: number | null
          processed_date?: string | null
          tds_total?: number | null
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      people_efficiency: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_demo: boolean
          overtime_cost: number
          overtime_hours: number
          period_start: string
          revenue_per_billable_hour: number
          training_spend: number
          utilisation_rate: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          overtime_cost?: number
          overtime_hours?: number
          period_start: string
          revenue_per_billable_hour?: number
          training_spend?: number
          utilisation_rate?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          overtime_cost?: number
          overtime_hours?: number
          period_start?: string
          revenue_per_billable_hour?: number
          training_spend?: number
          utilisation_rate?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_id: string | null
          created_at: string
          display_name: string | null
          full_name: string | null
          id: string
          language_preference: string | null
          mobile: string | null
          notification_prefs: Json | null
          role: string | null
          updated_at: string
          user_id: string
          whatsapp_phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id?: string
          language_preference?: string | null
          mobile?: string | null
          notification_prefs?: Json | null
          role?: string | null
          updated_at?: string
          user_id: string
          whatsapp_phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id?: string
          language_preference?: string | null
          mobile?: string | null
          notification_prefs?: Json | null
          role?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_cost: number
          business_id: string
          client_name: string | null
          created_at: string
          end_date: string | null
          gross_margin_pct: number
          id: string
          is_demo: boolean
          notes: string | null
          project_name: string
          quoted_amount: number
          start_date: string | null
          status: string
        }
        Insert: {
          actual_cost?: number
          business_id: string
          client_name?: string | null
          created_at?: string
          end_date?: string | null
          gross_margin_pct?: number
          id?: string
          is_demo?: boolean
          notes?: string | null
          project_name: string
          quoted_amount?: number
          start_date?: string | null
          status?: string
        }
        Update: {
          actual_cost?: number
          business_id?: string
          client_name?: string | null
          created_at?: string
          end_date?: string | null
          gross_margin_pct?: number
          id?: string
          is_demo?: boolean
          notes?: string | null
          project_name?: string
          quoted_amount?: number
          start_date?: string | null
          status?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      realtime_event_log: {
        Row: {
          business_id: string | null
          ca_firm_id: string | null
          channel_name: string
          context: Json
          emitted_by: string | null
          event_type: string
          handler_status: string
          id: string
          occurred_at: string
          row_id: string | null
          schema_name: string
          table_name: string
        }
        Insert: {
          business_id?: string | null
          ca_firm_id?: string | null
          channel_name: string
          context?: Json
          emitted_by?: string | null
          event_type: string
          handler_status?: string
          id?: string
          occurred_at?: string
          row_id?: string | null
          schema_name?: string
          table_name: string
        }
        Update: {
          business_id?: string | null
          ca_firm_id?: string | null
          channel_name?: string
          context?: Json
          emitted_by?: string | null
          event_type?: string
          handler_status?: string
          id?: string
          occurred_at?: string
          row_id?: string | null
          schema_name?: string
          table_name?: string
        }
        Relationships: []
      }
      receivable_chases: {
        Row: {
          chase_date: string
          id: string
          method: string | null
          notes: string | null
          receivable_id: string
        }
        Insert: {
          chase_date?: string
          id?: string
          method?: string | null
          notes?: string | null
          receivable_id: string
        }
        Update: {
          chase_date?: string
          id?: string
          method?: string | null
          notes?: string | null
          receivable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_chases_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          customer_name: string
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          last_chase: string | null
          outstanding: number | null
          received: number | null
          risk_score: number | null
          status: string | null
        }
        Insert: {
          amount?: number
          business_id: string
          created_at?: string
          customer_name: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          last_chase?: string | null
          outstanding?: number | null
          received?: number | null
          risk_score?: number | null
          status?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          customer_name?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          last_chase?: string | null
          outstanding?: number | null
          received?: number | null
          risk_score?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receivables_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_compliance: {
        Row: {
          business_id: string
          created_at: string
          due_date: string | null
          id: string
          is_demo: boolean
          notes: string | null
          requirement_name: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          requirement_name: string
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          requirement_name?: string
          status?: string
        }
        Relationships: []
      }
      resource_access_logs: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          ip_address: string | null
          outcome: string
          referer: string | null
          resource_id: string
          resource_title: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          id?: string
          ip_address?: string | null
          outcome?: string
          referer?: string | null
          resource_id: string
          resource_title?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string | null
          id?: string
          ip_address?: string | null
          outcome?: string
          referer?: string | null
          resource_id?: string
          resource_title?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      resource_glossary: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          full_definition: string
          id: string
          is_published: boolean
          related_terms: string[] | null
          short_definition: string
          sort_order: number
          term: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          full_definition: string
          id?: string
          is_published?: boolean
          related_terms?: string[] | null
          short_definition: string
          sort_order?: number
          term: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          full_definition?: string
          id?: string
          is_published?: boolean
          related_terms?: string[] | null
          short_definition?: string
          sort_order?: number
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      resource_videos: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string
          duration: string
          id: string
          is_published: boolean
          sort_order: number
          step: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          duration?: string
          id?: string
          is_published?: boolean
          sort_order?: number
          step: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          duration?: string
          id?: string
          is_published?: boolean
          sort_order?: number
          step?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      resources: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string
          external_url: string | null
          file_path: string | null
          file_url: string | null
          format: string
          icon_path: string | null
          icon_url: string | null
          id: string
          is_published: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string
          external_url?: string | null
          file_path?: string | null
          file_url?: string | null
          format?: string
          icon_path?: string | null
          icon_url?: string | null
          id: string
          is_published?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string
          external_url?: string | null
          file_path?: string | null
          file_url?: string | null
          format?: string
          icon_path?: string | null
          icon_url?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      revenue_alerts: {
        Row: {
          acknowledged_at: string | null
          business_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          recommended_action: string | null
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          recommended_action?: string | null
          severity?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          recommended_action?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      revenue_analytics_cache: {
        Row: {
          created_at: string
          date: string
          id: string
          metric_name: string
          metric_value: number | null
          period: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          metric_name: string
          metric_value?: number | null
          period?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          metric_name?: string
          metric_value?: number | null
          period?: string | null
        }
        Relationships: []
      }
      revenue_breakdowns: {
        Row: {
          breakdown_type: string
          business_id: string
          category_name: string
          id: string
          is_demo: boolean
          revenue_amount: number
        }
        Insert: {
          breakdown_type: string
          business_id: string
          category_name: string
          id?: string
          is_demo?: boolean
          revenue_amount?: number
        }
        Update: {
          breakdown_type?: string
          business_id?: string
          category_name?: string
          id?: string
          is_demo?: boolean
          revenue_amount?: number
        }
        Relationships: []
      }
      revenue_quality: {
        Row: {
          bookings_total: number
          business_id: string
          created_at: string
          id: string
          is_demo: boolean
          onetime_pct: number
          period_start: string
          project_pct: number
          recurring_pct: number
          recurring_revenue: number
          revenue_at_risk: number
          top3_client_pct: number
          total_revenue: number
        }
        Insert: {
          bookings_total?: number
          business_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          onetime_pct?: number
          period_start: string
          project_pct?: number
          recurring_pct?: number
          recurring_revenue?: number
          revenue_at_risk?: number
          top3_client_pct?: number
          total_revenue?: number
        }
        Update: {
          bookings_total?: number
          business_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          onetime_pct?: number
          period_start?: string
          project_pct?: number
          recurring_pct?: number
          recurring_revenue?: number
          revenue_at_risk?: number
          top3_client_pct?: number
          total_revenue?: number
        }
        Relationships: []
      }
      risk_register: {
        Row: {
          business_id: string
          current_exposure: number
          id: string
          impact: number
          is_active: boolean
          is_demo: boolean
          likelihood: number
          mitigation_status: string
          risk_category: string
          risk_name: string
          risk_score: number
        }
        Insert: {
          business_id: string
          current_exposure?: number
          id?: string
          impact?: number
          is_active?: boolean
          is_demo?: boolean
          likelihood?: number
          mitigation_status?: string
          risk_category: string
          risk_name: string
          risk_score?: number
        }
        Update: {
          business_id?: string
          current_exposure?: number
          id?: string
          impact?: number
          is_active?: boolean
          is_demo?: boolean
          likelihood?: number
          mitigation_status?: string
          risk_category?: string
          risk_name?: string
          risk_score?: number
        }
        Relationships: []
      }
      rls_security_findings: {
        Row: {
          checked_at: string
          detail: Json
          finding_type: string
          id: string
          resolved: boolean
          severity: string
          table_name: string
        }
        Insert: {
          checked_at?: string
          detail?: Json
          finding_type: string
          id?: string
          resolved?: boolean
          severity: string
          table_name: string
        }
        Update: {
          checked_at?: string
          detail?: Json
          finding_type?: string
          id?: string
          resolved?: boolean
          severity?: string
          table_name?: string
        }
        Relationships: []
      }
      roadmap_stops: {
        Row: {
          color: string
          created_at: string
          description: string
          emoji: string
          href: string
          id: string
          name: string
          side: string
          sort_order: number
          status: string
          stop_number: number
          updated_at: string
          widget: string
          x_pct: number
          y_pct: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          emoji?: string
          href?: string
          id?: string
          name: string
          side?: string
          sort_order?: number
          status?: string
          stop_number: number
          updated_at?: string
          widget?: string
          x_pct?: number
          y_pct?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          emoji?: string
          href?: string
          id?: string
          name?: string
          side?: string
          sort_order?: number
          status?: string
          stop_number?: number
          updated_at?: string
          widget?: string
          x_pct?: number
          y_pct?: number
        }
        Relationships: []
      }
      sales_pipeline: {
        Row: {
          business_id: string
          close_date: string | null
          customer_name: string
          deal_name: string
          deal_value: number
          id: string
          is_demo: boolean
          is_lost: boolean
          is_won: boolean
          owner_name: string | null
          probability: number
          stage: string
        }
        Insert: {
          business_id: string
          close_date?: string | null
          customer_name: string
          deal_name: string
          deal_value?: number
          id?: string
          is_demo?: boolean
          is_lost?: boolean
          is_won?: boolean
          owner_name?: string | null
          probability?: number
          stage: string
        }
        Update: {
          business_id?: string
          close_date?: string | null
          customer_name?: string
          deal_name?: string
          deal_value?: number
          id?: string
          is_demo?: boolean
          is_lost?: boolean
          is_won?: boolean
          owner_name?: string | null
          probability?: number
          stage?: string
        }
        Relationships: []
      }
      simulations: {
        Row: {
          business_id: string
          created_at: string
          id: string
          parameters: Json | null
          results: Json | null
          scenario_type: string
          shared_link: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          parameters?: Json | null
          results?: Json | null
          scenario_type: string
          shared_link?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          parameters?: Json | null
          results?: Json | null
          scenario_type?: string
          shared_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simulations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          media_urls: string[] | null
          metrics: Json | null
          platform: string
          post_type: string | null
          recipient_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target_audience: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          media_urls?: string[] | null
          metrics?: Json | null
          platform: string
          post_type?: string | null
          recipient_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_audience?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          media_urls?: string[] | null
          metrics?: Json | null
          platform?: string
          post_type?: string | null
          recipient_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_audience?: string | null
        }
        Relationships: []
      }
      subscription_audit: {
        Row: {
          action: string | null
          business_id: string
          id: string
          is_demo: boolean
          is_duplicate: boolean
          licenses_purchased: number
          licenses_used: number
          monthly_cost: number
          potential_savings: number
          product: string
          status: string
          utilization_pct: number
          vendor: string
        }
        Insert: {
          action?: string | null
          business_id: string
          id?: string
          is_demo?: boolean
          is_duplicate?: boolean
          licenses_purchased?: number
          licenses_used?: number
          monthly_cost?: number
          potential_savings?: number
          product: string
          status?: string
          utilization_pct?: number
          vendor: string
        }
        Update: {
          action?: string | null
          business_id?: string
          id?: string
          is_demo?: boolean
          is_duplicate?: boolean
          licenses_purchased?: number
          licenses_used?: number
          monthly_cost?: number
          potential_savings?: number
          product?: string
          status?: string
          utilization_pct?: number
          vendor?: string
        }
        Relationships: []
      }
      subscription_history: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          id: string
          new_mrr: number | null
          new_plan: string | null
          old_mrr: number | null
          old_plan: string | null
          subscription_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_mrr?: number | null
          new_plan?: string | null
          old_mrr?: number | null
          old_plan?: string | null
          subscription_id: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_mrr?: number | null
          new_plan?: string | null
          old_mrr?: number | null
          old_plan?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          business_id: string | null
          cancelled_at: string | null
          created_at: string
          id: string
          mrr: number
          next_billing_date: string | null
          payment_method: string | null
          payment_method_details: Json
          plan_type: string
          started_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_cycle?: string
          business_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          mrr?: number
          next_billing_date?: string | null
          payment_method?: string | null
          payment_method_details?: Json
          plan_type?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_cycle?: string
          business_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          id?: string
          mrr?: number
          next_billing_date?: string | null
          payment_method?: string | null
          payment_method_details?: Json
          plan_type?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_intelligence: {
        Row: {
          avg_resolution_hours: number
          business_id: string
          cost_per_ticket: number
          created_at: string
          id: string
          is_demo: boolean
          period_start: string
          satisfaction_score: number
          total_tickets: number
        }
        Insert: {
          avg_resolution_hours?: number
          business_id: string
          cost_per_ticket?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          period_start: string
          satisfaction_score?: number
          total_tickets?: number
        }
        Update: {
          avg_resolution_hours?: number
          business_id?: string
          cost_per_ticket?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          period_start?: string
          satisfaction_score?: number
          total_tickets?: number
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          business_id: string | null
          category: string | null
          closed_at: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_id?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_id?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_health_checks: {
        Row: {
          checked_at: string
          error_message: string | null
          id: string
          response_time_ms: number | null
          service_name: string
          status: string
        }
        Insert: {
          checked_at?: string
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          service_name: string
          status: string
        }
        Update: {
          checked_at?: string
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          service_name?: string
          status?: string
        }
        Relationships: []
      }
      tax_planning: {
        Row: {
          business_id: string
          carry_forward_losses: number
          depreciation: number
          depreciation_method: string | null
          effective_tax_rate: number
          financial_year: string
          id: string
          is_demo: boolean
          section_80iac_status: string | null
          section_80iac_year: number | null
          strategies: Json
        }
        Insert: {
          business_id: string
          carry_forward_losses?: number
          depreciation?: number
          depreciation_method?: string | null
          effective_tax_rate?: number
          financial_year: string
          id?: string
          is_demo?: boolean
          section_80iac_status?: string | null
          section_80iac_year?: number | null
          strategies?: Json
        }
        Update: {
          business_id?: string
          carry_forward_losses?: number
          depreciation?: number
          depreciation_method?: string | null
          effective_tax_rate?: number
          financial_year?: string
          id?: string
          is_demo?: boolean
          section_80iac_status?: string | null
          section_80iac_year?: number | null
          strategies?: Json
        }
        Relationships: []
      }
      tds_filings: {
        Row: {
          acknowledgement_number: string | null
          business_id: string
          challan_number: string | null
          created_at: string
          due_date: string
          filed_date: string | null
          form_type: string
          id: string
          notes: string | null
          quarter: string
          status: string
          total_tds_deducted: number | null
          total_tds_deposited: number | null
          updated_at: string
        }
        Insert: {
          acknowledgement_number?: string | null
          business_id: string
          challan_number?: string | null
          created_at?: string
          due_date: string
          filed_date?: string | null
          form_type: string
          id?: string
          notes?: string | null
          quarter: string
          status?: string
          total_tds_deducted?: number | null
          total_tds_deposited?: number | null
          updated_at?: string
        }
        Update: {
          acknowledgement_number?: string | null
          business_id?: string
          challan_number?: string | null
          created_at?: string
          due_date?: string
          filed_date?: string | null
          form_type?: string
          id?: string
          notes?: string | null
          quarter?: string
          status?: string
          total_tds_deducted?: number | null
          total_tds_deposited?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tds_intelligence: {
        Row: {
          amount_deducted: number
          amount_deposited: number
          business_id: string
          created_at: string
          description: string | null
          financial_year: string
          id: string
          is_demo: boolean
          matched_26as: boolean
          rate: number
          return_filed: boolean
          section_code: string
          status: string
        }
        Insert: {
          amount_deducted?: number
          amount_deposited?: number
          business_id: string
          created_at?: string
          description?: string | null
          financial_year: string
          id?: string
          is_demo?: boolean
          matched_26as?: boolean
          rate?: number
          return_filed?: boolean
          section_code: string
          status?: string
        }
        Update: {
          amount_deducted?: number
          amount_deposited?: number
          business_id?: string
          created_at?: string
          description?: string | null
          financial_year?: string
          id?: string
          is_demo?: boolean
          matched_26as?: boolean
          rate?: number
          return_filed?: boolean
          section_code?: string
          status?: string
        }
        Relationships: []
      }
      ticket_replies: {
        Row: {
          attachments: string[] | null
          author_id: string | null
          created_at: string
          id: string
          is_admin: boolean
          is_internal_note: boolean
          message: string
          ticket_id: string
        }
        Insert: {
          attachments?: string[] | null
          author_id?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          is_internal_note?: boolean
          message: string
          ticket_id: string
        }
        Update: {
          attachments?: string[] | null
          author_id?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          is_internal_note?: boolean
          message?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          balance_after: number | null
          bank_account_id: string | null
          business_id: string
          category: string | null
          counterparty: string | null
          created_at: string
          date: string
          description: string | null
          direction: string
          id: string
          transaction_date: string | null
          transaction_time: string | null
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id?: string | null
          business_id: string
          category?: string | null
          counterparty?: string | null
          created_at?: string
          date: string
          description?: string | null
          direction: string
          id?: string
          transaction_date?: string | null
          transaction_time?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string | null
          business_id?: string
          category?: string | null
          counterparty?: string | null
          created_at?: string
          date?: string
          description?: string | null
          direction?: string
          id?: string
          transaction_date?: string | null
          transaction_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_gst_health: {
        Row: {
          business_id: string
          compliance_score: number | null
          created_at: string
          id: string
          last_filed: string | null
          vendor_gstin: string | null
          vendor_name: string
        }
        Insert: {
          business_id: string
          compliance_score?: number | null
          created_at?: string
          id?: string
          last_filed?: string | null
          vendor_gstin?: string | null
          vendor_name: string
        }
        Update: {
          business_id?: string
          compliance_score?: number | null
          created_at?: string
          id?: string
          last_filed?: string | null
          vendor_gstin?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_gst_health_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          business_id: string
          city: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          payment_terms_days: number | null
          phone: string | null
          total_outstanding: number
          updated_at: string
          vendor_category: string | null
          vendor_name: string
        }
        Insert: {
          business_id: string
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          payment_terms_days?: number | null
          phone?: string | null
          total_outstanding?: number
          updated_at?: string
          vendor_category?: string | null
          vendor_name: string
        }
        Update: {
          business_id?: string
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          payment_terms_days?: number | null
          phone?: string | null
          total_outstanding?: number
          updated_at?: string
          vendor_category?: string | null
          vendor_name?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          client_entities: string | null
          company_name: string
          company_size: string
          company_type: string
          created_at: string
          email: string
          hear_about: string | null
          id: string
          is_converted: boolean
          landing_page: string | null
          location: string
          month_end_pain: string | null
          name: string
          phone: string
          position: number
          referrer: string | null
          role: string | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          client_entities?: string | null
          company_name: string
          company_size: string
          company_type: string
          created_at?: string
          email: string
          hear_about?: string | null
          id?: string
          is_converted?: boolean
          landing_page?: string | null
          location: string
          month_end_pain?: string | null
          name: string
          phone: string
          position: number
          referrer?: string | null
          role?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          client_entities?: string | null
          company_name?: string
          company_size?: string
          company_type?: string
          created_at?: string
          email?: string
          hear_about?: string | null
          id?: string
          is_converted?: boolean
          landing_page?: string | null
          location?: string
          month_end_pain?: string | null
          name?: string
          phone?: string
          position?: number
          referrer?: string | null
          role?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      waitlist_signups: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          source: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          source?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          source?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          organization_id: string | null
          payload: Json
          processed: boolean
          provider: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          organization_id?: string | null
          payload: Json
          processed?: boolean
          provider: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          organization_id?: string | null
          payload?: Json
          processed?: boolean
          provider?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          media_url: string | null
          message_text: string
          read_at: string | null
          recipient_count: number | null
          recipient_phone: string | null
          sent_at: string | null
          sent_by: string | null
          social_post_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          media_url?: string | null
          message_text: string
          read_at?: string | null
          recipient_count?: number | null
          recipient_phone?: string | null
          sent_at?: string | null
          sent_by?: string | null
          social_post_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          media_url?: string | null
          message_text?: string
          read_at?: string | null
          recipient_count?: number | null
          recipient_phone?: string | null
          sent_at?: string | null
          sent_by?: string | null
          social_post_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_social_post_id_fkey"
            columns: ["social_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_ca_invitation: { Args: { _token: string }; Returns: string }
      admin_ai_usage_overview: {
        Args: never
        Returns: {
          blocked_today: number
          business_id: string
          business_name: string
          daily_limit: number
          last_used_at: string
          remaining: number
          used_30d: number
          used_7d: number
          used_today: number
        }[]
      }
      audit_rls_permissiveness: {
        Args: never
        Returns: {
          detail: Json
          finding_type: string
          severity: string
          table_name: string
        }[]
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      ca_can: {
        Args: { _firm_id: string; _permission: string }
        Returns: boolean
      }
      ca_firm_has_all_client_access: {
        Args: { _business_ids: string[]; _firm_id: string }
        Returns: boolean
      }
      ca_firm_has_client_access: {
        Args: { _business_id: string; _firm_id: string }
        Returns: boolean
      }
      ca_firm_owns_client: {
        Args: { _client_id: string; _firm_id: string }
        Returns: boolean
      }
      ca_member_role: { Args: { _firm_id: string }; Returns: string }
      ca_probe_sample: {
        Args: { p_limit?: number }
        Returns: {
          allowed_firms: string[]
          firm_id: string
          probe_user: string
        }[]
      }
      check_ai_quota: {
        Args: { _business_id: string; _user_id: string }
        Returns: Json
      }
      check_and_increment_rate_limit: {
        Args: {
          p_action: string
          p_identifier: string
          p_lockout_seconds?: number
          p_max_attempts?: number
          p_window_seconds?: number
        }
        Returns: Json
      }
      check_waitlist_status: {
        Args: { _email: string }
        Returns: {
          email_exists: boolean
          total_count: number
        }[]
      }
      clear_ca_demo_data: { Args: never; Returns: string }
      client_portal_business_id: { Args: never; Returns: string }
      compute_client_health_score: {
        Args: { p_business_id: string; p_ca_firm_id: string }
        Returns: Json
      }
      decline_ca_invitation: { Args: { _token: string }; Returns: string }
      generate_compliance_calendar: {
        Args: {
          p_business_id: string
          p_ca_firm_id: string
          p_financial_year?: string
        }
        Returns: number
      }
      get_ca_invitation: {
        Args: { _token: string }
        Returns: {
          access_level: string
          client_name: string
          expires_at: string
          firm_name: string
          invited_email: string
          status: string
        }[]
      }
      get_latest_demo_insight: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          data: Json
          id: string
          org_id: string
        }[]
      }
      get_shared_mis_report: { Args: { p_token: string }; Returns: Json }
      get_user_business_id: { Args: never; Returns: string }
      get_user_ca_firm_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      increment_blog_views: { Args: { p_slug: string }; Returns: undefined }
      is_admin_user: { Args: never; Returns: boolean }
      is_blog_admin: { Args: never; Returns: boolean }
      is_blog_editor: { Args: never; Returns: boolean }
      is_ca_firm_privileged: { Args: { _firm_id: string }; Returns: boolean }
      is_demo_viewer: { Args: never; Returns: boolean }
      is_senior_admin: { Args: never; Returns: boolean }
      lookup_client_by_reference: {
        Args: { p_ca_firm_id: string; p_reference_code: string }
        Returns: {
          business_id: string
          business_name: string
          client_reference_code: string
          gstin: string
          is_active: boolean
          storage_namespace: string
        }[]
      }
      mark_overdue_filings: { Args: never; Returns: number }
      probe_ca_firm_isolation: {
        Args: { p_firm_sample?: number }
        Returns: Json
      }
      publish_due_blog_posts: { Args: never; Returns: number }
      reset_rate_limit: {
        Args: { p_action: string; p_identifier: string }
        Returns: undefined
      }
      run_security_sanity_check: { Args: { p_probe?: Json }; Returns: Json }
      security_check_caller_allowed: { Args: never; Returns: boolean }
      text_to_bytea: { Args: { data: string }; Returns: string }
      trigger_ca_auto_escalate_chasers: { Args: never; Returns: undefined }
      trigger_ca_auto_followup: { Args: never; Returns: undefined }
      trigger_ca_brain_master: { Args: never; Returns: undefined }
      trigger_ca_integration_sync: { Args: never; Returns: undefined }
      trigger_ca_poll_gmail: { Args: never; Returns: undefined }
      trigger_compliance_alerts: { Args: never; Returns: undefined }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      user_in_ca_firm: { Args: { _firm_id: string }; Returns: boolean }
      zoho_exchange_code: {
        Args: { p_code: string; p_state: string }
        Returns: Json
      }
      zoho_get_auth_url: { Args: { p_organization_id: string }; Returns: Json }
      zoho_sync_transactions: {
        Args: { p_organization_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "super_admin"
        | "ops_admin"
        | "support_agent"
        | "analyst"
        | "blog_admin"
        | "intern"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
    Enums: {
      app_role: [
        "admin",
        "moderator",
        "user",
        "super_admin",
        "ops_admin",
        "support_agent",
        "analyst",
        "blog_admin",
        "intern",
      ],
    },
  },
} as const
