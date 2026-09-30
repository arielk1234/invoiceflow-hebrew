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
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          business_id: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          business_id: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          business_id?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["business_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string
          business_type: Database["public"]["Enums"]["business_type"]
          created_at: string
          document_prefix: string
          email: string
          id: string
          name: string
          phone: string
          tax_id: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          address?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          document_prefix?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          tax_id?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          address?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          document_prefix?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          tax_id?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string
          business_id: string
          created_at: string
          email: string
          id: string
          is_vat_registered: boolean
          name: string
          phone: string
          tax_id: string
          updated_at: string
        }
        Insert: {
          address?: string
          business_id: string
          created_at?: string
          email?: string
          id?: string
          is_vat_registered?: boolean
          name?: string
          phone?: string
          tax_id?: string
          updated_at?: string
        }
        Update: {
          address?: string
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          is_vat_registered?: boolean
          name?: string
          phone?: string
          tax_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      document_items: {
        Row: {
          created_at: string
          description: string
          document_id: string
          id: string
          position: number
          quantity: number
          unit_price: number
          unit: string
        }
        Insert: {
          created_at?: string
          description?: string
          document_id: string
          id?: string
          position?: number
          quantity?: number
          unit_price?: number
          unit?: string
        }
        Update: {
          created_at?: string
          description?: string
          document_id?: string
          id?: string
          position?: number
          quantity?: number
          unit_price?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          business_id: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          last_number: number
          year: number
        }
        Insert: {
          business_id: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          last_number?: number
          year: number
        }
        Update: {
          business_id?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          last_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      document_snapshots: {
        Row: {
          business_id: string
          captured_at: string
          captured_by: string | null
          content_hash: string
          document_id: string
          id: string
          payload: Json
          snapshot_version: number
        }
        Insert: {
          business_id: string
          captured_at?: string
          captured_by?: string | null
          content_hash: string
          document_id: string
          id?: string
          payload: Json
          snapshot_version?: number
        }
        Update: {
          business_id?: string
          captured_at?: string
          captured_by?: string | null
          content_hash?: string
          document_id?: string
          id?: string
          payload?: Json
          snapshot_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_snapshots_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          allocation_decision: string | null
          allocation_decision_at: string | null
          allocation_number: string | null
          allocation_requested: boolean
          allocation_requested_at: string | null
          business_id: string
          cancel_reason: string | null
          cheque_account: string | null
          cheque_bank: string | null
          cheque_branch: string | null
          cheque_number: string | null
          cancelled_at: string | null
          client_id: string
          content_hash: string | null
          credit_reason: string | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          issue_date: string
          issued_at: string | null
          issued_by: string | null
          notes: string
          original_printed_at: string | null
          number: string
          payment_method: string
          print_count: number
          related_document_id: string | null
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          total_amount: number
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          allocation_decision?: string | null
          allocation_decision_at?: string | null
          allocation_number?: string | null
          allocation_requested?: boolean
          allocation_requested_at?: string | null
          business_id: string
          cancel_reason?: string | null
          cheque_account?: string | null
          cheque_bank?: string | null
          cheque_branch?: string | null
          cheque_number?: string | null
          cancelled_at?: string | null
          client_id: string
          content_hash?: string | null
          credit_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          issue_date?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string
          original_printed_at?: string | null
          number?: string
          payment_method?: string
          print_count?: number
          related_document_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          total_amount?: number
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          allocation_decision?: string | null
          allocation_decision_at?: string | null
          allocation_number?: string | null
          allocation_requested?: boolean
          allocation_requested_at?: string | null
          business_id?: string
          cancel_reason?: string | null
          cheque_account?: string | null
          cheque_bank?: string | null
          cheque_branch?: string | null
          cheque_number?: string | null
          cancelled_at?: string | null
          client_id?: string
          content_hash?: string | null
          credit_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          issue_date?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string
          original_printed_at?: string | null
          number?: string
          payment_method?: string
          print_count?: number
          related_document_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          total_amount?: number
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_business_id_fkey"
            columns: ["client_id", "business_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "documents_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_name: string
          business_type: Database["public"]["Enums"]["business_type"]
          created_at: string
          email: string
          full_name: string
          id: string
          tax_id: string
          updated_at: string
        }
        Insert: {
          business_name?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          email?: string
          full_name?: string
          id: string
          tax_id?: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          tax_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_authority_connections: {
        Row: {
          access_token_ciphertext: string | null
          access_token_expires_at: string | null
          business_id: string
          connected_by: string | null
          created_at: string
          environment: string
          id: string
          provider: string
          refresh_token_ciphertext: string | null
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          business_id: string
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          provider?: string
          refresh_token_ciphertext?: string | null
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          business_id?: string
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          provider?: string
          refresh_token_ciphertext?: string | null
          scope?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_authority_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_authority_requests: {
        Row: {
          business_id: string
          created_at: string
          document_id: string
          error_code: string | null
          error_message: string | null
          external_reference: string | null
          id: string
          idempotency_key: string
          request_kind: string
          response_payload: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          document_id: string
          error_code?: string | null
          error_message?: string | null
          external_reference?: string | null
          id?: string
          idempotency_key: string
          request_kind: string
          response_payload?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          document_id?: string
          error_code?: string | null
          error_message?: string | null
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          request_kind?: string
          response_payload?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_authority_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_authority_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_tax_authority_request: {
        Args: { _document_id: string; _idempotency_key: string }
        Returns: Database["public"]["Tables"]["tax_authority_requests"]["Row"]
      }
      calculate_document_totals: {
        Args: { p_document_id: string }
        Returns: { subtotal: number; total_amount: number; vat_amount: number }[]
      }
      can_access_document: { Args: { _document_id: string }; Returns: boolean }
      cancel_document: {
        Args: { _document_id: string; _reason?: string }
        Returns: undefined
      }
      create_business: {
        Args: {
          _address?: string
          _business_type: Database["public"]["Enums"]["business_type"]
          _email?: string
          _name: string
          _phone?: string
          _tax_id: string
        }
        Returns: string
      }
      get_tax_authority_connection_status: {
        Args: { _business_id: string; _environment: string }
        Returns: {
          connected: boolean
          connected_at: string
          environment: string
          expires_at: string
          scope: string
        }[]
      }
      has_business_role: {
        Args: {
          _business_id: string
          _roles: Database["public"]["Enums"]["business_role"][]
        }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      issue_document: {
        Args: { _document_id: string }
        Returns: Database["public"]["Tables"]["documents"]["Row"]
      }
      log_audit: {
        Args: {
          _action: string
          _business_id: string
          _entity: string
          _entity_id: string
          _payload: Json
        }
        Returns: undefined
      }
      next_document_number: {
        Args: {
          _business_id: string
          _type: Database["public"]["Enums"]["doc_type"]
          _year?: number
        }
        Returns: string
      }
      record_document_print: {
        Args: { _document_id: string }
        Returns: string
      }
      reserve_document_number: {
        Args: { _document_id: string }
        Returns: string
      }
      update_tax_authority_request: {
        Args: {
          _error_code?: string
          _error_message?: string
          _external_reference?: string
          _request_id: string
          _response_payload?: Json
          _status: string
        }
        Returns: Database["public"]["Tables"]["tax_authority_requests"]["Row"]
      }
    }
    Enums: {
      business_role: "owner" | "admin" | "user"
      business_type: "osek_patur" | "osek_murshe" | "company"
      doc_status: "draft" | "issued" | "sent" | "paid" | "cancelled"
      doc_type: "invoice" | "receipt" | "credit_note"
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
      business_role: ["owner", "admin", "user"],
      business_type: ["osek_patur", "osek_murshe", "company"],
      doc_status: ["draft", "issued", "sent", "paid", "cancelled"],
      doc_type: ["invoice", "receipt", "credit_note"],
    },
  },
} as const
