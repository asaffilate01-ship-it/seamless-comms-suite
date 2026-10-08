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
      addon_entitlements: {
        Row: {
          addon: string
          billing_reference: string
          status: string
          tenant_id: string
          updated_at: string
          valid_until: string
        }
        Insert: {
          addon: string
          billing_reference: string
          status: string
          tenant_id: string
          updated_at?: string
          valid_until: string
        }
        Update: {
          addon?: string
          billing_reference?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          payload: Json | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          payload?: Json | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          payload?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string | null
          id: string
          node_id: string
          requested_from_role: string | null
          run_id: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          node_id: string
          requested_from_role?: string | null
          run_id: string
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          node_id?: string
          requested_from_role?: string | null
          run_id?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          completed_at: string | null
          context: Json
          created_at: string
          current_node_id: string | null
          error: string | null
          event_id: string | null
          id: string
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_id?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_id?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "platform_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          active_version: number
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          id: string
          name: string
          product_key: string | null
          status: string
          tenant_id: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          active_version?: number
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          name: string
          product_key?: string | null
          status?: string
          tenant_id: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          active_version?: number
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          name?: string
          product_key?: string | null
          status?: string
          tenant_id?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "automation_workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_products: {
        Row: {
          blueprint_key: string
          config: Json
          product_key: string
          required: boolean
        }
        Insert: {
          blueprint_key: string
          config?: Json
          product_key: string
          required?: boolean
        }
        Update: {
          blueprint_key?: string
          config?: Json
          product_key?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_products_blueprint_key_fkey"
            columns: ["blueprint_key"]
            isOneToOne: false
            referencedRelation: "tenant_blueprints"
            referencedColumns: ["blueprint_key"]
          },
          {
            foreignKeyName: "blueprint_products_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
        ]
      }
      blueprint_services: {
        Row: {
          blueprint_key: string
          config: Json
          required: boolean
          service_key: string
        }
        Insert: {
          blueprint_key: string
          config?: Json
          required?: boolean
          service_key: string
        }
        Update: {
          blueprint_key?: string
          config?: Json
          required?: boolean
          service_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_services_blueprint_key_fkey"
            columns: ["blueprint_key"]
            isOneToOne: false
            referencedRelation: "tenant_blueprints"
            referencedColumns: ["blueprint_key"]
          },
          {
            foreignKeyName: "blueprint_services_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["service_key"]
          },
        ]
      }
      cases: {
        Row: {
          assignee: string | null
          conversation_id: string | null
          created_at: string
          id: string
          priority: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          consent_marketing: boolean | null
          created_at: string
          display_name: string | null
          id: string
          locale: string | null
          tenant_id: string
          updated_at: string
          wa_id: string
        }
        Insert: {
          consent_marketing?: boolean | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string | null
          tenant_id: string
          updated_at?: string
          wa_id: string
        }
        Update: {
          consent_marketing?: boolean | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string | null
          tenant_id?: string
          updated_at?: string
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assignee: string | null
          channel_id: string | null
          contact_id: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          assignee?: string | null
          channel_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          assignee?: string | null
          channel_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channel_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_assets: {
        Row: {
          asset_type: string
          brief_id: string
          channel: string
          created_at: string
          evidence_refs: Json
          id: string
          locale: string
          model_run_id: string | null
          product_key: string | null
          published_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          source_asset_refs: string[]
          status: string
          tenant_id: string
          updated_at: string
          uri: string
          variant_key: string | null
        }
        Insert: {
          asset_type: string
          brief_id: string
          channel: string
          created_at?: string
          evidence_refs?: Json
          id?: string
          locale: string
          model_run_id?: string | null
          product_key?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          source_asset_refs?: string[]
          status?: string
          tenant_id: string
          updated_at?: string
          uri: string
          variant_key?: string | null
        }
        Update: {
          asset_type?: string
          brief_id?: string
          channel?: string
          created_at?: string
          evidence_refs?: Json
          id?: string
          locale?: string
          model_run_id?: string | null
          product_key?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          source_asset_refs?: string[]
          status?: string
          tenant_id?: string
          updated_at?: string
          uri?: string
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_assets_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assets_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "creative_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_brand_kits: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          asset_refs: string[]
          banned_terms: string[]
          brand_key: string
          colours: string[]
          created_at: string
          fonts: string[]
          id: string
          locale: string | null
          logos: string[]
          name: string
          product_key: string | null
          region_key: string | null
          required_disclaimers: string[]
          revision: number
          status: string
          tenant_id: string
          tone: string[]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          asset_refs?: string[]
          banned_terms?: string[]
          brand_key?: string
          colours?: string[]
          created_at?: string
          fonts?: string[]
          id?: string
          locale?: string | null
          logos?: string[]
          name: string
          product_key?: string | null
          region_key?: string | null
          required_disclaimers?: string[]
          revision?: number
          status?: string
          tenant_id: string
          tone?: string[]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          asset_refs?: string[]
          banned_terms?: string[]
          brand_key?: string
          colours?: string[]
          created_at?: string
          fonts?: string[]
          id?: string
          locale?: string | null
          logos?: string[]
          name?: string
          product_key?: string | null
          region_key?: string | null
          required_disclaimers?: string[]
          revision?: number
          status?: string
          tenant_id?: string
          tone?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_brand_kits_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "creative_brand_kits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_briefs: {
        Row: {
          asset_types: string[]
          audience: string
          brand_kit_id: string | null
          call_to_action: string | null
          campaign_id: string | null
          campaign_ref: string | null
          channels: string[]
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          message: string
          objective: string
          offer: string | null
          product_key: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          asset_types?: string[]
          audience: string
          brand_kit_id?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          campaign_ref?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          message: string
          objective: string
          offer?: string | null
          product_key?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          asset_types?: string[]
          audience?: string
          brand_kit_id?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          campaign_ref?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          message?: string
          objective?: string
          offer?: string | null
          product_key?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_briefs_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "creative_brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_briefs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_briefs_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "creative_briefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_localisation_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          output_asset_id: string | null
          product_key: string | null
          requirements: Json
          reviewed_by: string | null
          source_asset_id: string
          status: string
          target_channel: string | null
          target_locale: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          output_asset_id?: string | null
          product_key?: string | null
          requirements?: Json
          reviewed_by?: string | null
          source_asset_id: string
          status?: string
          target_channel?: string | null
          target_locale: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          output_asset_id?: string | null
          product_key?: string | null
          requirements?: Json
          reviewed_by?: string | null
          source_asset_id?: string
          status?: string
          target_channel?: string | null
          target_locale?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_localisation_jobs_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_localisation_jobs_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "creative_localisation_jobs_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_localisation_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_type: string
          actor_user_id: string | null
          case_id: string | null
          company_id: string | null
          conversation_id: string | null
          created_at: string
          external_ref: string | null
          id: string
          lead_id: string | null
          metadata: Json
          occurred_at: string
          opportunity_id: string | null
          person_id: string | null
          source_product_key: string | null
          summary: string
          tenant_id: string
        }
        Insert: {
          activity_type: string
          actor_user_id?: string | null
          case_id?: string | null
          company_id?: string | null
          conversation_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          opportunity_id?: string | null
          person_id?: string | null
          source_product_key?: string | null
          summary: string
          tenant_id: string
        }
        Update: {
          activity_type?: string
          actor_user_id?: string | null
          case_id?: string | null
          company_id?: string | null
          conversation_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          opportunity_id?: string | null
          person_id?: string | null
          source_product_key?: string | null
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_companies: {
        Row: {
          created_at: string
          external_ref: string | null
          id: string
          industry: string | null
          legal_name: string | null
          metadata: Json
          name: string
          owner_user_id: string | null
          source_product_key: string | null
          status: string
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          external_ref?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          metadata?: Json
          name: string
          owner_user_id?: string | null
          source_product_key?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          external_ref?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          metadata?: Json
          name?: string
          owner_user_id?: string | null
          source_product_key?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          company_id: string | null
          converted_opportunity_id: string | null
          created_at: string
          external_ref: string | null
          id: string
          metadata: Json
          owner_user_id: string | null
          person_id: string | null
          score: number | null
          source: string | null
          source_product_key: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          converted_opportunity_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          metadata?: Json
          owner_user_id?: string | null
          person_id?: string | null
          score?: number | null
          source?: string | null
          source_product_key?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          converted_opportunity_id?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          metadata?: Json
          owner_user_id?: string | null
          person_id?: string | null
          score?: number | null
          source?: string | null
          source_product_key?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_converted_opportunity_id_fkey"
            columns: ["converted_opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunities: {
        Row: {
          amount: number | null
          company_id: string | null
          created_at: string
          currency: string | null
          expected_close_at: string | null
          external_ref: string | null
          id: string
          metadata: Json
          owner_user_id: string | null
          person_id: string | null
          pipeline_id: string
          probability_percent: number | null
          source_product_key: string | null
          stage_id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          company_id?: string | null
          created_at?: string
          currency?: string | null
          expected_close_at?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json
          owner_user_id?: string | null
          person_id?: string | null
          pipeline_id: string
          probability_percent?: number | null
          source_product_key?: string | null
          stage_id: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          company_id?: string | null
          created_at?: string
          currency?: string | null
          expected_close_at?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json
          owner_user_id?: string | null
          person_id?: string | null
          pipeline_id?: string
          probability_percent?: number | null
          source_product_key?: string | null
          stage_id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_people: {
        Row: {
          channel_preferences: Json
          company_id: string | null
          created_at: string
          display_name: string
          email: string | null
          external_ref: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lifecycle_stage: string
          locale: string | null
          marketing_consent: boolean
          metadata: Json
          owner_user_id: string | null
          phone_e164: string | null
          source_product_key: string | null
          tags: string[]
          tenant_id: string
          updated_at: string
          whatsapp_contact_id: string | null
        }
        Insert: {
          channel_preferences?: Json
          company_id?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          external_ref?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lifecycle_stage?: string
          locale?: string | null
          marketing_consent?: boolean
          metadata?: Json
          owner_user_id?: string | null
          phone_e164?: string | null
          source_product_key?: string | null
          tags?: string[]
          tenant_id: string
          updated_at?: string
          whatsapp_contact_id?: string | null
        }
        Update: {
          channel_preferences?: Json
          company_id?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          external_ref?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lifecycle_stage?: string
          locale?: string | null
          marketing_consent?: boolean
          metadata?: Json
          owner_user_id?: string | null
          phone_e164?: string | null
          source_product_key?: string | null
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          whatsapp_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_people_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_people_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_people_whatsapp_contact_id_fkey"
            columns: ["whatsapp_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_closed_lost: boolean
          is_closed_won: boolean
          name: string
          pipeline_id: string
          position: number
          probability_percent: number
          stage_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_closed_lost?: boolean
          is_closed_won?: boolean
          name: string
          pipeline_id: string
          position?: number
          probability_percent?: number
          stage_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_closed_lost?: boolean
          is_closed_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          probability_percent?: number
          stage_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          kind: string
          name: string
          pipeline_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name: string
          pipeline_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name?: string
          pipeline_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assignee_user_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          external_ref: string | null
          id: string
          metadata: Json
          priority: string
          related_id: string | null
          related_type: string | null
          source_product_key: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json
          priority?: string
          related_id?: string | null
          related_type?: string | null
          source_product_key?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json
          priority?: string
          related_id?: string | null
          related_type?: string | null
          source_product_key?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_journeys: {
        Row: {
          created_at: string
          definition: Json
          id: string
          name: string
          product_key: string | null
          status: string
          tenant_id: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition?: Json
          id?: string
          name: string
          product_key?: string | null
          status?: string
          tenant_id: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          name?: string
          product_key?: string | null
          status?: string
          tenant_id?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_journeys_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "customer_journeys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_records: {
        Row: {
          created_at: string
          created_by: string | null
          current_version: number
          document_type: string
          id: string
          metadata: Json
          product_key: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          document_type: string
          id?: string
          metadata?: Json
          product_key?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          document_type?: string
          id?: string
          metadata?: Json
          product_key?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_records_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "document_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          checksum_sha256: string | null
          created_at: string
          created_by: string | null
          document_id: string
          extracted_text: string | null
          metadata: Json
          mime_type: string | null
          size_bytes: number | null
          storage_ref: string
          tenant_id: string
          version: number
        }
        Insert: {
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          extracted_text?: string | null
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          storage_ref: string
          tenant_id: string
          version: number
        }
        Update: {
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          extracted_text?: string | null
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          storage_ref?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_responses: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          metadata: Json
          person_id: string | null
          recovery_status: string
          score: number
          sentiment: string | null
          subject_id: string | null
          subject_type: string | null
          survey_id: string
          tenant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          person_id?: string | null
          recovery_status?: string
          score: number
          sentiment?: string | null
          subject_id?: string | null
          subject_type?: string | null
          survey_id: string
          tenant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          person_id?: string | null
          recovery_status?: string
          score?: number
          sentiment?: string | null
          subject_id?: string | null
          subject_type?: string | null
          survey_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "feedback_surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_surveys: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          product_key: string | null
          status: string
          survey_type: string
          tenant_id: string
          trigger_event: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          name: string
          product_key?: string | null
          status?: string
          survey_type: string
          tenant_id: string
          trigger_event?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          product_key?: string | null
          status?: string
          survey_type?: string
          tenant_id?: string
          trigger_event?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_surveys_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "feedback_surveys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          active_version: number
          created_at: string
          form_key: string
          id: string
          name: string
          product_key: string | null
          schema: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active_version?: number
          created_at?: string
          form_key: string
          id?: string
          name: string
          product_key?: string | null
          schema?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active_version?: number
          created_at?: string
          form_key?: string
          id?: string
          name?: string
          product_key?: string | null
          schema?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_definitions_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "form_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          answers: Json
          created_at: string
          definition_id: string
          form_version: number
          id: string
          product_key: string | null
          revision: number
          status: string
          subject_id: string | null
          subject_type: string | null
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          definition_id: string
          form_version: number
          id?: string
          product_key?: string | null
          revision?: number
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          definition_id?: string
          form_version?: number
          id?: string
          product_key?: string | null
          revision?: number
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_customer_metrics: {
        Row: {
          churn_risk: number | null
          frequency_score: number | null
          last_order_at: string | null
          ltv_minor: number
          monetary_score: number | null
          orders_count: number
          person_id: string
          recency_days: number | null
          revenue_minor: number
          rfm_segment: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          churn_risk?: number | null
          frequency_score?: number | null
          last_order_at?: string | null
          ltv_minor?: number
          monetary_score?: number | null
          orders_count?: number
          person_id: string
          recency_days?: number | null
          revenue_minor?: number
          rfm_segment?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          churn_risk?: number | null
          frequency_score?: number | null
          last_order_at?: string | null
          ltv_minor?: number
          monetary_score?: number | null
          orders_count?: number
          person_id?: string
          recency_days?: number | null
          revenue_minor?: number
          rfm_segment?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_customer_metrics_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_customer_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_segment_members: {
        Row: {
          person_id: string
          reason: Json
          segment_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          person_id: string
          reason?: Json
          segment_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          person_id?: string
          reason?: Json
          segment_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_segment_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "growth_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_segment_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_segments: {
        Row: {
          created_at: string
          id: string
          name: string
          product_key: string | null
          rules: Json
          segment_key: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_key?: string | null
          rules?: Json
          segment_key: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_key?: string | null
          rules?: Json
          segment_key?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_segments_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "growth_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_studio_brands: {
        Row: {
          audience: string
          created_at: string
          created_by: string
          disclosure: string
          id: string
          locale: string
          name: string
          offer: string
          product_key: string
          revision: number
          rules: string[]
          tenant_id: string
          updated_at: string
          voice: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by: string
          disclosure?: string
          id?: string
          locale?: string
          name: string
          offer?: string
          product_key: string
          revision?: number
          rules?: string[]
          tenant_id: string
          updated_at?: string
          voice?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string
          disclosure?: string
          id?: string
          locale?: string
          name?: string
          offer?: string
          product_key?: string
          revision?: number
          rules?: string[]
          tenant_id?: string
          updated_at?: string
          voice?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_studio_brands_tenant_id_product_key_fkey"
            columns: ["tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "tenant_products"
            referencedColumns: ["tenant_id", "product_key"]
          },
        ]
      }
      growth_studio_campaign_evidence: {
        Row: {
          brand_id: string
          campaign_id: string
          evidence_id: string
          product_key: string
          tenant_id: string
        }
        Insert: {
          brand_id: string
          campaign_id: string
          evidence_id: string
          product_key: string
          tenant_id: string
        }
        Update: {
          brand_id?: string
          campaign_id?: string
          evidence_id?: string
          product_key?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_studio_campaign_eviden_campaign_id_brand_id_tenant__fkey"
            columns: ["campaign_id", "brand_id", "tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "growth_studio_campaigns"
            referencedColumns: ["id", "brand_id", "tenant_id", "product_key"]
          },
          {
            foreignKeyName: "growth_studio_campaign_eviden_evidence_id_brand_id_tenant__fkey"
            columns: ["evidence_id", "brand_id", "tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "growth_studio_evidence"
            referencedColumns: ["id", "brand_id", "tenant_id", "product_key"]
          },
        ]
      }
      growth_studio_campaigns: {
        Row: {
          brand_id: string
          channel: string
          created_at: string
          created_by: string
          id: string
          locale: string
          objective: string
          product_key: string
          revision: number
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          channel: string
          created_at?: string
          created_by: string
          id?: string
          locale: string
          objective: string
          product_key: string
          revision?: number
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          channel?: string
          created_at?: string
          created_by?: string
          id?: string
          locale?: string
          objective?: string
          product_key?: string
          revision?: number
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_studio_campaigns_brand_id_tenant_id_product_key_fkey"
            columns: ["brand_id", "tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "growth_studio_brands"
            referencedColumns: ["id", "tenant_id", "product_key"]
          },
        ]
      }
      growth_studio_evidence: {
        Row: {
          brand_id: string
          content: string
          created_at: string
          created_by: string | null
          external_ref: string | null
          id: string
          kind: string
          product_key: string
          revision: number
          source_credential_id: string | null
          source_url: string | null
          tenant_id: string
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          brand_id: string
          content: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          kind: string
          product_key: string
          revision?: number
          source_credential_id?: string | null
          source_url?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          brand_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          kind?: string
          product_key?: string
          revision?: number
          source_credential_id?: string | null
          source_url?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_studio_evidence_brand_id_tenant_id_product_key_fkey"
            columns: ["brand_id", "tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "growth_studio_brands"
            referencedColumns: ["id", "tenant_id", "product_key"]
          },
          {
            foreignKeyName: "growth_studio_evidence_source_credential_id_fkey"
            columns: ["source_credential_id"]
            isOneToOne: false
            referencedRelation: "platform_service_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_studio_runs: {
        Row: {
          brand_id: string
          campaign_id: string
          classifier_binding_id: string | null
          created_at: string
          created_by: string
          creative_brief_id: string | null
          error: string | null
          execution_token: string
          finished_at: string | null
          id: string
          input_snapshot: Json
          lease_expires_at: string
          marketing_campaign_id: string | null
          model: string
          note: string | null
          product_key: string
          provider_key: string
          request_key: string
          result: Json | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          status: string
          tenant_id: string
          updated_at: string
          writer_binding_id: string | null
        }
        Insert: {
          brand_id: string
          campaign_id: string
          classifier_binding_id?: string | null
          created_at?: string
          created_by: string
          creative_brief_id?: string | null
          error?: string | null
          execution_token?: string
          finished_at?: string | null
          id?: string
          input_snapshot: Json
          lease_expires_at?: string
          marketing_campaign_id?: string | null
          model: string
          note?: string | null
          product_key: string
          provider_key: string
          request_key: string
          result?: Json | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          tenant_id: string
          updated_at?: string
          writer_binding_id?: string | null
        }
        Update: {
          brand_id?: string
          campaign_id?: string
          classifier_binding_id?: string | null
          created_at?: string
          created_by?: string
          creative_brief_id?: string | null
          error?: string | null
          execution_token?: string
          finished_at?: string | null
          id?: string
          input_snapshot?: Json
          lease_expires_at?: string
          marketing_campaign_id?: string | null
          model?: string
          note?: string | null
          product_key?: string
          provider_key?: string
          request_key?: string
          result?: Json | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          writer_binding_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_studio_runs_campaign_id_brand_id_tenant_id_product__fkey"
            columns: ["campaign_id", "brand_id", "tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "growth_studio_campaigns"
            referencedColumns: ["id", "brand_id", "tenant_id", "product_key"]
          },
          {
            foreignKeyName: "growth_studio_runs_creative_brief_id_tenant_id_product_key_fkey"
            columns: ["creative_brief_id", "tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "creative_briefs"
            referencedColumns: ["id", "tenant_id", "product_key"]
          },
          {
            foreignKeyName: "growth_studio_runs_marketing_campaign_id_tenant_id_product_fkey"
            columns: ["marketing_campaign_id", "tenant_id", "product_key"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id", "tenant_id", "product_key"]
          },
        ]
      }
      journey_enrolments: {
        Row: {
          context: Json
          current_node: string | null
          id: string
          journey_id: string
          person_id: string | null
          started_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          context?: Json
          current_node?: string | null
          id?: string
          journey_id: string
          person_id?: string | null
          started_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          context?: Json
          current_node?: string | null
          id?: string
          journey_id?: string
          person_id?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_enrolments_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "customer_journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrolments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_enrolments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      locale_packs: {
        Row: {
          country_code: string | null
          created_at: string
          date_format: string | null
          language_code: string
          locale: string
          number_format: string | null
          rtl: boolean
          status: string
          terminology: Json
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          date_format?: string | null
          language_code: string
          locale: string
          number_format?: string | null
          rtl?: boolean
          status?: string
          terminology?: Json
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          date_format?: string | null
          language_code?: string
          locale?: string
          number_format?: string | null
          rtl?: boolean
          status?: string
          terminology?: Json
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          channel: string
          clicked_count: number
          completed_at: string | null
          content: Json
          created_at: string
          delivered_count: number
          id: string
          name: string
          opened_count: number
          product_key: string | null
          scheduled_at: string | null
          segment_id: string | null
          sent_count: number
          started_at: string | null
          status: string
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          clicked_count?: number
          completed_at?: string | null
          content?: Json
          created_at?: string
          delivered_count?: number
          id?: string
          name: string
          opened_count?: number
          product_key?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          clicked_count?: number
          completed_at?: string | null
          content?: Json
          created_at?: string
          delivered_count?: number
          id?: string
          name?: string
          opened_count?: number
          product_key?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "marketing_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "growth_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media_url: string | null
          msg_type: string
          sent_by: string | null
          status: string | null
          tenant_id: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          media_url?: string | null
          msg_type?: string
          sent_by?: string | null
          status?: string | null
          tenant_id: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          msg_type?: string
          sent_by?: string | null
          status?: string | null
          tenant_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          available_at: string
          channel: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          payload: Json
          person_id: string | null
          product_key: string | null
          purpose: string
          recipient: Json
          sent_at: string | null
          status: string
          template_key: string | null
          tenant_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          channel: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          payload?: Json
          person_id?: string | null
          product_key?: string | null
          purpose: string
          recipient?: Json
          sent_at?: string | null
          status?: string
          template_key?: string | null
          tenant_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          channel?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          payload?: Json
          person_id?: string | null
          product_key?: string | null
          purpose?: string
          recipient?: Json
          sent_at?: string | null
          status?: string
          template_key?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "notification_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          enabled: boolean
          person_id: string
          purpose: string
          quiet_hours: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          enabled?: boolean
          person_id: string
          purpose: string
          quiet_hours?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          person_id?: string
          purpose?: string
          quiet_hours?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          created_at: string
          organisation_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organisation_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          organisation_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          billing_currency: string
          billing_email: string | null
          country_code: string
          created_at: string
          id: string
          metadata: Json
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          billing_currency?: string
          billing_email?: string | null
          country_code?: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          billing_currency?: string
          billing_email?: string | null
          country_code?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_event_deliveries: {
        Row: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          event_id: string
          id: string
          last_error: string | null
          status: string
          subscription_id: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          last_error?: string | null
          status?: string
          subscription_id: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          last_error?: string | null
          status?: string
          subscription_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_event_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "platform_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_event_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "platform_event_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_event_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_event_subscriptions: {
        Row: {
          config: Json
          created_at: string
          destination_kind: string
          destination_ref: string
          event_patterns: string[]
          id: string
          name: string
          product_key: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          destination_kind: string
          destination_ref: string
          event_patterns?: string[]
          id?: string
          name: string
          product_key?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          destination_kind?: string
          destination_ref?: string
          event_patterns?: string[]
          id?: string
          name?: string
          product_key?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_event_subscriptions_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "platform_event_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_events: {
        Row: {
          brand_id: string | null
          causation_id: string | null
          correlation_id: string | null
          created_at: string
          data_classification: string
          event_type: string
          event_version: number
          id: string
          idempotency_key: string
          location_id: string | null
          occurred_at: string
          payload: Json
          product_key: string
          source_service: string | null
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
        }
        Insert: {
          brand_id?: string | null
          causation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          data_classification?: string
          event_type: string
          event_version?: number
          id?: string
          idempotency_key: string
          location_id?: string | null
          occurred_at?: string
          payload?: Json
          product_key: string
          source_service?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
        }
        Update: {
          brand_id?: string | null
          causation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          data_classification?: string
          event_type?: string
          event_version?: number
          id?: string
          idempotency_key?: string
          location_id?: string | null
          occurred_at?: string
          payload?: Json
          product_key?: string
          source_service?: string | null
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "tenant_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_events_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "platform_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_service_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_id: string
          last_used_at: string | null
          scopes: Json
          secret_hash: string
          secret_suffix: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_id: string
          last_used_at?: string | null
          scopes?: Json
          secret_hash: string
          secret_suffix: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_id?: string
          last_used_at?: string | null
          scopes?: Json
          secret_hash?: string
          secret_suffix?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_catalogue: {
        Row: {
          category: string
          created_at: string
          default_base_url: string | null
          deployment_mode: string
          description: string | null
          implementation_status: string
          metadata: Json
          name: string
          parent_product_key: string | null
          product_key: string
          product_role: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          default_base_url?: string | null
          deployment_mode?: string
          description?: string | null
          implementation_status?: string
          metadata?: Json
          name: string
          parent_product_key?: string | null
          product_key: string
          product_role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_base_url?: string | null
          deployment_mode?: string
          description?: string | null
          implementation_status?: string
          metadata?: Json
          name?: string
          parent_product_key?: string | null
          product_key?: string
          product_role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_catalogue_parent_product_key_fkey"
            columns: ["parent_product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
        ]
      }
      product_connections: {
        Row: {
          base_url: string | null
          capabilities: string[]
          created_at: string
          external_tenant_id: string
          id: string
          last_verified_at: string | null
          metadata: Json
          product_key: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          capabilities?: string[]
          created_at?: string
          external_tenant_id: string
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          product_key: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          capabilities?: string[]
          created_at?: string
          external_tenant_id?: string
          id?: string
          last_verified_at?: string | null
          metadata?: Json
          product_key?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_connections_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "product_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_provider_requirements: {
        Row: {
          config: Json
          product_key: string
          provider_key: string
          purpose: string
          required: boolean
        }
        Insert: {
          config?: Json
          product_key: string
          provider_key: string
          purpose: string
          required?: boolean
        }
        Update: {
          config?: Json
          product_key?: string
          provider_key?: string
          purpose?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_provider_requirements_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "product_provider_requirements_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "provider_catalogue"
            referencedColumns: ["provider_key"]
          },
        ]
      }
      product_services: {
        Row: {
          default_enabled: boolean
          metadata: Json
          product_key: string
          required: boolean
          service_key: string
        }
        Insert: {
          default_enabled?: boolean
          metadata?: Json
          product_key: string
          required?: boolean
          service_key: string
        }
        Update: {
          default_enabled?: boolean
          metadata?: Json
          product_key?: string
          required?: boolean
          service_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_services_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "product_services_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["service_key"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_bindings: {
        Row: {
          brand_id: string | null
          config: Json
          created_at: string
          environment: string
          health: Json
          id: string
          last_verified_at: string | null
          location_id: string | null
          product_key: string
          provider_key: string
          secret_refs: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          config?: Json
          created_at?: string
          environment?: string
          health?: Json
          id?: string
          last_verified_at?: string | null
          location_id?: string | null
          product_key: string
          provider_key: string
          secret_refs?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          config?: Json
          created_at?: string
          environment?: string
          health?: Json
          id?: string
          last_verified_at?: string | null
          location_id?: string | null
          product_key?: string
          provider_key?: string
          secret_refs?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_bindings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "tenant_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_bindings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "tenant_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_bindings_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "provider_bindings_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "provider_catalogue"
            referencedColumns: ["provider_key"]
          },
          {
            foreignKeyName: "provider_bindings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_catalogue: {
        Row: {
          capabilities: string[]
          created_at: string
          implementation_status: string
          metadata: Json
          name: string
          provider_key: string
          provider_kind: string
          public_config_names: string[]
          required_secret_names: string[]
          status: string
          supported_countries: string[]
          updated_at: string
        }
        Insert: {
          capabilities?: string[]
          created_at?: string
          implementation_status?: string
          metadata?: Json
          name: string
          provider_key: string
          provider_kind: string
          public_config_names?: string[]
          required_secret_names?: string[]
          status?: string
          supported_countries?: string[]
          updated_at?: string
        }
        Update: {
          capabilities?: string[]
          created_at?: string
          implementation_status?: string
          metadata?: Json
          name?: string
          provider_key?: string
          provider_kind?: string
          public_config_names?: string[]
          required_secret_names?: string[]
          status?: string
          supported_countries?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      provisioning_events: {
        Row: {
          created_at: string
          detail: Json
          event: string
          id: number
          job_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          event: string
          id?: never
          job_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          event?: string
          id?: never
          job_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "provisioning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provisioning_jobs: {
        Row: {
          action: string
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          payload: Json
          requested_by: string | null
          started_at: string | null
          status: string
          target_key: string
          target_kind: string
          tenant_id: string
        }
        Insert: {
          action?: string
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          payload?: Json
          requested_by?: string | null
          started_at?: string | null
          status?: string
          target_key: string
          target_kind: string
          tenant_id: string
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          payload?: Json
          requested_by?: string | null
          started_at?: string | null
          status?: string
          target_key?: string
          target_kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      region_packs: {
        Row: {
          country_code: string
          created_at: string
          currency: string
          data_region: string
          legal_config: Json
          name: string
          provider_preferences: Json
          region_key: string
          status: string
          supported_locales: string[]
          tax_config: Json
          timezones: string[]
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          currency: string
          data_region?: string
          legal_config?: Json
          name: string
          provider_preferences?: Json
          region_key: string
          status?: string
          supported_locales?: string[]
          tax_config?: Json
          timezones?: string[]
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          currency?: string
          data_region?: string
          legal_config?: Json
          name?: string
          provider_preferences?: Json
          region_key?: string
          status?: string
          supported_locales?: string[]
          tax_config?: Json
          timezones?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      rrci_members: {
        Row: {
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rrci_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "rrci_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rrci_workspaces: {
        Row: {
          created_at: string
          environment: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          environment: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rrci_workspaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_sequence_enrolments: {
        Row: {
          created_at: string
          current_step: number
          id: string
          lead_id: string | null
          metadata: Json
          next_action_at: string | null
          person_id: string | null
          sequence_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          id?: string
          lead_id?: string | null
          metadata?: Json
          next_action_at?: string | null
          person_id?: string | null
          sequence_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_step?: number
          id?: string
          lead_id?: string | null
          metadata?: Json
          next_action_at?: string | null
          person_id?: string | null
          sequence_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_sequence_enrolments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sequence_enrolments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sequence_enrolments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sales_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sequence_enrolments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_sequences: {
        Row: {
          created_at: string
          id: string
          name: string
          product_key: string | null
          status: string
          steps: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_key?: string | null
          status?: string
          steps?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_key?: string | null
          status?: string
          steps?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_sequences_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "sales_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_documents: {
        Row: {
          body: string
          entity_id: string
          entity_type: string
          id: string
          keywords: string[]
          metadata: Json
          product_key: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          entity_id: string
          entity_type: string
          id?: string
          keywords?: string[]
          metadata?: Json
          product_key?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          entity_id?: string
          entity_type?: string
          id?: string
          keywords?: string[]
          metadata?: Json
          product_key?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_documents_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "search_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalogue: {
        Row: {
          billable: boolean
          created_at: string
          description: string | null
          family: string
          implementation_status: string
          metadata: Json
          name: string
          owner_product_key: string | null
          provisioning_mode: string
          service_key: string
          status: string
          updated_at: string
        }
        Insert: {
          billable?: boolean
          created_at?: string
          description?: string | null
          family: string
          implementation_status?: string
          metadata?: Json
          name: string
          owner_product_key?: string | null
          provisioning_mode?: string
          service_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          billable?: boolean
          created_at?: string
          description?: string | null
          family?: string
          implementation_status?: string
          metadata?: Json
          name?: string
          owner_product_key?: string | null
          provisioning_mode?: string
          service_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalogue_owner_product_key_fkey"
            columns: ["owner_product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
        ]
      }
      service_dependencies: {
        Row: {
          depends_on_service_key: string
          required: boolean
          service_key: string
        }
        Insert: {
          depends_on_service_key: string
          required?: boolean
          service_key: string
        }
        Update: {
          depends_on_service_key?: string
          required?: boolean
          service_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_dependencies_depends_on_service_key_fkey"
            columns: ["depends_on_service_key"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["service_key"]
          },
          {
            foreignKeyName: "service_dependencies_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["service_key"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_user_id: string | null
          channel: string
          created_at: string
          description: string | null
          id: string
          metadata: Json
          person_id: string | null
          priority: string
          product_key: string | null
          resolved_at: string | null
          sla_due_at: string | null
          source_ref: string | null
          status: string
          subject: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          person_id?: string | null
          priority?: string
          product_key?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          source_ref?: string | null
          status?: string
          subject: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          person_id?: string | null
          priority?: string
          product_key?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          source_ref?: string | null
          status?: string
          subject?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "crm_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_blueprints: {
        Row: {
          blueprint_key: string
          category: string
          country_code: string | null
          created_at: string
          description: string | null
          metadata: Json
          name: string
          status: string
        }
        Insert: {
          blueprint_key: string
          category: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          metadata?: Json
          name: string
          status?: string
        }
        Update: {
          blueprint_key?: string
          category?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          metadata?: Json
          name?: string
          status?: string
        }
        Relationships: []
      }
      tenant_branding: {
        Row: {
          brand_name: string | null
          dark_logo_url: string | null
          email_from_address: string | null
          email_from_name: string | null
          favicon_url: string | null
          font_family: string | null
          logo_url: string | null
          metadata: Json
          primary_colour: string | null
          privacy_url: string | null
          secondary_colour: string | null
          sms_sender: string | null
          socials: Json
          support_email: string | null
          support_phone: string | null
          tenant_id: string
          terms_url: string | null
          updated_at: string
          whatsapp_sender: string | null
        }
        Insert: {
          brand_name?: string | null
          dark_logo_url?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          favicon_url?: string | null
          font_family?: string | null
          logo_url?: string | null
          metadata?: Json
          primary_colour?: string | null
          privacy_url?: string | null
          secondary_colour?: string | null
          sms_sender?: string | null
          socials?: Json
          support_email?: string | null
          support_phone?: string | null
          tenant_id: string
          terms_url?: string | null
          updated_at?: string
          whatsapp_sender?: string | null
        }
        Update: {
          brand_name?: string | null
          dark_logo_url?: string | null
          email_from_address?: string | null
          email_from_name?: string | null
          favicon_url?: string | null
          font_family?: string | null
          logo_url?: string | null
          metadata?: Json
          primary_colour?: string | null
          privacy_url?: string | null
          secondary_colour?: string | null
          sms_sender?: string | null
          socials?: Json
          support_email?: string | null
          support_phone?: string | null
          tenant_id?: string
          terms_url?: string | null
          updated_at?: string
          whatsapp_sender?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_brands: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          logo_url: string | null
          name: string
          product_key: string | null
          slug: string
          tenant_id: string
          theme: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          logo_url?: string | null
          name: string
          product_key?: string | null
          slug: string
          tenant_id: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          logo_url?: string | null
          name?: string
          product_key?: string | null
          slug?: string
          tenant_id?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_brands_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "tenant_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_data_routes: {
        Row: {
          config: Json
          connection_ref: string | null
          data_region: string
          product_key: string
          routing_mode: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          connection_ref?: string | null
          data_region?: string
          product_key: string
          routing_mode?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          connection_ref?: string | null
          data_region?: string
          product_key?: string
          routing_mode?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_data_routes_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "tenant_data_routes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          domain: string
          domain_type: string
          id: string
          is_primary: boolean
          metadata: Json
          product_key: string | null
          ssl_status: string
          tenant_id: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          domain: string
          domain_type?: string
          id?: string
          is_primary?: boolean
          metadata?: Json
          product_key?: string | null
          ssl_status?: string
          tenant_id: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          domain?: string
          domain_type?: string
          id?: string
          is_primary?: boolean
          metadata?: Json
          product_key?: string | null
          ssl_status?: string
          tenant_id?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_locations: {
        Row: {
          address: Json
          brand_id: string | null
          code: string
          created_at: string
          id: string
          metadata: Json
          name: string
          status: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: Json
          brand_id?: string | null
          code: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          status?: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: Json
          brand_id?: string | null
          code?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          status?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_locations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "tenant_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_products: {
        Row: {
          activated_at: string | null
          base_url: string | null
          config: Json
          external_tenant_id: string | null
          launch_status: string
          locale: string
          plan_key: string | null
          product_key: string
          region_key: string
          runtime_config: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          base_url?: string | null
          config?: Json
          external_tenant_id?: string | null
          launch_status?: string
          locale?: string
          plan_key?: string | null
          product_key: string
          region_key?: string
          runtime_config?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          base_url?: string | null
          config?: Json
          external_tenant_id?: string | null
          launch_status?: string
          locale?: string
          plan_key?: string | null
          product_key?: string
          region_key?: string
          runtime_config?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_products_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "tenant_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_services: {
        Row: {
          billing_reference: string | null
          config: Json
          service_key: string
          source: string
          status: string
          tenant_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          billing_reference?: string | null
          config?: Json
          service_key: string
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          billing_reference?: string | null
          config?: Json
          service_key?: string
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_services_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["service_key"]
          },
          {
            foreignKeyName: "tenant_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          country_code: string
          created_at: string
          currency: string
          id: string
          metadata: Json
          name: string
          organisation_id: string
          slug: string
          status: string
          timezone: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          name: string
          organisation_id: string
          slug: string
          status?: string
          timezone?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          name?: string
          organisation_id?: string
          slug?: string
          status?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          metadata: Json
          metric_key: string
          occurred_at: string
          product_key: string
          quantity: number
          service_key: string | null
          tenant_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          metadata?: Json
          metric_key: string
          occurred_at?: string
          product_key: string
          quantity?: number
          service_key?: string | null
          tenant_id: string
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          metric_key?: string
          occurred_at?: string
          product_key?: string
          quantity?: number
          service_key?: string | null
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "product_catalogue"
            referencedColumns: ["product_key"]
          },
          {
            foreignKeyName: "usage_events_service_key_fkey"
            columns: ["service_key"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["service_key"]
          },
          {
            foreignKeyName: "usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_channels: {
        Row: {
          access_token: string
          app_secret: string | null
          created_at: string
          display_phone: string | null
          id: string
          phone_number_id: string
          status: string
          tenant_id: string
          updated_at: string
          verify_token: string
          waba_id: string | null
        }
        Insert: {
          access_token: string
          app_secret?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          verify_token: string
          waba_id?: string | null
        }
        Update: {
          access_token?: string
          app_secret?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          verify_token?: string
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      whatsapp_channel_status: {
        Row: {
          display_phone: string | null
          id: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          display_phone?: string | null
          id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          display_phone?: string | null
          id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_service_with_dependencies: {
        Args: { _service: string; _source?: string; _tenant: string }
        Returns: undefined
      }
      automation_enqueue_for_event: {
        Args: { _event: string }
        Returns: number
      }
      can_write: { Args: { _tenant: string; _user: string }; Returns: boolean }
      create_my_tenant: {
        Args: { _name: string; _slug: string }
        Returns: Json
      }
      create_rrci_workspace: {
        Args: { _environment: string; _name: string; _tenant: string }
        Returns: string
      }
      crm_ensure_default_pipeline: {
        Args: { _tenant: string }
        Returns: string
      }
      get_control_plane_catalogue: { Args: never; Returns: Json }
      get_rrci_access: { Args: { _workspace?: string }; Returns: Json }
      get_tenant_control_plane: { Args: { _tenant: string }; Returns: Json }
      get_tenant_product_readiness: {
        Args: { _product: string; _tenant: string }
        Returns: Json
      }
      growth_recompute_customer_metrics: {
        Args: { _tenant: string }
        Returns: number
      }
      growth_studio_assert_access: {
        Args: { _mode: string; _product: string; _tenant: string }
        Returns: undefined
      }
      growth_studio_assert_reviewable: {
        Args: { r: Database["public"]["Tables"]["growth_studio_runs"]["Row"] }
        Returns: undefined
      }
      growth_studio_assert_service_scope: {
        Args: {
          _brand: string
          _capability: string
          _credential: string
          _product: string
          _tenant: string
        }
        Returns: undefined
      }
      growth_studio_brand_doc: {
        Args: { r: Database["public"]["Tables"]["growth_studio_brands"]["Row"] }
        Returns: Json
      }
      growth_studio_campaign_doc: {
        Args: {
          r: Database["public"]["Tables"]["growth_studio_campaigns"]["Row"]
        }
        Returns: Json
      }
      growth_studio_can_access: {
        Args: {
          _actor: string
          _mode?: string
          _product: string
          _tenant: string
        }
        Returns: boolean
      }
      growth_studio_evidence_doc: {
        Args: {
          r: Database["public"]["Tables"]["growth_studio_evidence"]["Row"]
        }
        Returns: Json
      }
      growth_studio_export_product_campaign: {
        Args: {
          _brand: string
          _credential: string
          _product: string
          _run: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_finish_run: {
        Args: {
          _claim_token: string
          _error: string
          _product: string
          _result: Json
          _run: string
          _status: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_get_run: {
        Args: { _product: string; _run: string; _tenant: string }
        Returns: Json
      }
      growth_studio_handoff_access: {
        Args: { _id: string; _mode: string; _target: string }
        Returns: boolean
      }
      growth_studio_handoff_run: {
        Args: {
          _expected_revision: number
          _product: string
          _run: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_ingest_product_evidence: {
        Args: {
          _brand: string
          _credential: string
          _data: Json
          _external_ref: string
          _product: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_review_run: {
        Args: {
          _decision: string
          _expected_revision: number
          _note: string
          _product: string
          _run: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_run_current: {
        Args: { r: Database["public"]["Tables"]["growth_studio_runs"]["Row"] }
        Returns: boolean
      }
      growth_studio_run_doc: {
        Args: { r: Database["public"]["Tables"]["growth_studio_runs"]["Row"] }
        Returns: Json
      }
      growth_studio_save_brand: {
        Args: {
          _data: Json
          _expected_revision: number
          _id: string
          _product: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_save_campaign: {
        Args: {
          _brand: string
          _data: Json
          _expected_revision: number
          _id: string
          _product: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_save_evidence: {
        Args: {
          _brand: string
          _data: Json
          _expected_revision: number
          _id: string
          _product: string
          _tenant: string
        }
        Returns: Json
      }
      growth_studio_snapshot: {
        Args: { _campaign: string; _product: string; _tenant: string }
        Returns: Json
      }
      growth_studio_start_run: {
        Args: {
          _campaign: string
          _classifier_binding: string
          _model: string
          _product: string
          _provider: string
          _request_key: string
          _tenant: string
          _writer_binding: string
        }
        Returns: Json
      }
      growth_studio_workspace: {
        Args: { _product: string; _tenant: string }
        Returns: Json
      }
      has_tenant_entitlement: {
        Args: { _service: string; _tenant: string }
        Returns: boolean
      }
      has_tenant_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _tenant: string
          _user: string
        }
        Returns: boolean
      }
      is_organisation_member: {
        Args: { _organisation: string; _user: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant: string; _user: string }
        Returns: boolean
      }
      notification_enqueue: {
        Args: {
          _channel: string
          _idempotency: string
          _payload: Json
          _person: string
          _product: string
          _purpose: string
          _recipient: Json
          _template: string
          _tenant: string
        }
        Returns: string
      }
      platform_apply_blueprint: {
        Args: { _blueprint: string; _tenant: string }
        Returns: undefined
      }
      platform_bootstrap_dishbee_pilot: { Args: never; Returns: Json }
      platform_create_tenant: {
        Args: {
          _blueprint_key?: string
          _country_code?: string
          _currency?: string
          _organisation_id: string
          _organisation_name: string
          _slug: string
          _tenant_name: string
          _timezone?: string
        }
        Returns: string
      }
      platform_link_product: {
        Args: {
          _base_url?: string
          _capabilities?: string[]
          _external_tenant_id: string
          _product: string
          _tenant: string
        }
        Returns: string
      }
      platform_list_tenants: { Args: never; Returns: Json }
      platform_set_branding: {
        Args: { _branding: Json; _tenant: string }
        Returns: undefined
      }
      platform_set_data_route: {
        Args: {
          _config?: Json
          _connection_ref: string
          _mode: string
          _product: string
          _region: string
          _tenant: string
        }
        Returns: undefined
      }
      platform_set_service_credential: {
        Args: {
          _key_id: string
          _scopes: Json
          _secret_hash: string
          _secret_suffix: string
          _valid_days?: number
        }
        Returns: string
      }
      platform_set_tenant_product: {
        Args: {
          _config?: Json
          _enabled: boolean
          _product: string
          _tenant: string
        }
        Returns: undefined
      }
      platform_set_tenant_product_runtime: {
        Args: {
          _locale: string
          _product: string
          _region: string
          _runtime_config?: Json
          _tenant: string
        }
        Returns: undefined
      }
      platform_set_tenant_service: {
        Args: {
          _config?: Json
          _enabled: boolean
          _service: string
          _tenant: string
        }
        Returns: undefined
      }
      platform_upsert_domain: {
        Args: {
          _domain: string
          _primary?: boolean
          _product: string
          _tenant: string
        }
        Returns: string
      }
      platform_upsert_provider_binding: {
        Args: {
          _brand: string
          _config: Json
          _environment: string
          _location: string
          _product: string
          _provider: string
          _secret_refs: Json
          _tenant: string
        }
        Returns: string
      }
      platform_upsert_tenant_brand: {
        Args: {
          _logo_url?: string
          _name: string
          _primary?: boolean
          _product: string
          _slug: string
          _tenant: string
          _theme?: Json
        }
        Returns: string
      }
      platform_upsert_tenant_location: {
        Args: {
          _address?: Json
          _brand: string
          _code: string
          _name: string
          _status?: string
          _tenant: string
          _timezone?: string
        }
        Returns: string
      }
      queue_provisioning: {
        Args: {
          _action: string
          _key: string
          _kind: string
          _payload?: Json
          _tenant: string
        }
        Returns: string
      }
      rrci_has_access: { Args: { _workspace: string }; Returns: boolean }
      search_tenant: {
        Args: { _limit?: number; _query: string; _tenant: string }
        Returns: {
          entity_id: string
          entity_type: string
          excerpt: string
          rank: number
          title: string
        }[]
      }
      server_block_provisioning_job: {
        Args: { _detail?: Json; _job: string; _reason: string }
        Returns: boolean
      }
      server_claim_provisioning_jobs: {
        Args: { _limit?: number }
        Returns: {
          action: string
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          payload: Json
          requested_by: string | null
          started_at: string | null
          status: string
          target_key: string
          target_kind: string
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "provisioning_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "agent" | "viewer"
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
    Enums: {
      app_role: ["owner", "admin", "agent", "viewer"],
    },
  },
} as const
