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
          name: string
          phone: string
          tax_id: string
          is_vat_registered: boolean
          updated_at: string
        }
        Insert: {
          address?: string
          business_id: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          tax_id?: string
          is_vat_registered?: boolean
          updated_at?: string
        }
        Update: {
          address?: string
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          tax_id?: string
          is_vat_registered?: boolean
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
        }
        Insert: {
          created_at?: string
          description?: string
          document_id: string
          id?: string
          position?: number
          quantity?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          document_id?: string
          id?: string
          position?: number
          quantity?: number
          unit_price?: number
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
      documents: {
        Row: {
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          client_id: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          issue_date: string
          issued_at: string | null
          issued_by: string | null
          notes: string
          number: string
          payment_method: string
          related_document_id: string | null
          allocation_requested: boolean
          allocation_number: string | null
          allocation_requested_at: string | null
          subtotal: number
          vat_amount: number
          total_amount: number
          status: Database["public"]["Enums"]["doc_status"]
          type: Database["public"]["Enums"]["doc_type"]
          updated_at: string
          vat_rate: number
        }
        Insert: {
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          issue_date?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string
          number?: string
          payment_method?: string
          related_document_id?: string | null
          allocation_requested?: boolean
          allocation_number?: string | null
          allocation_requested_at?: string | null
          subtotal?: number
          vat_amount?: number
          total_amount?: number
          status?: Database["public"]["Enums"]["doc_status"]
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          issue_date?: string
          issued_at?: string | null
          issued_by?: string | null
          notes?: string
          number?: string
          payment_method?: string
          related_document_id?: string | null
          allocation_requested?: boolean
          allocation_number?: string | null
          allocation_requested_at?: string | null
          subtotal?: number
          vat_amount?: number
          total_amount?: number
          status?: Database["public"]["Enums"]["doc_status"]
          type?: Database["public"]["Enums"]["doc_type"]
          updated_at?: string
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
        ]
      }
      tax_authority_connections: {
        Row: {
          id: string
          business_id: string
          provider: string
          environment: string
          access_token_ciphertext: string | null
          refresh_token_ciphertext: string | null
          access_token_expires_at: string | null
          scope: string | null
          connected_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          provider?: string
          environment?: string
          access_token_ciphertext?: string | null
          refresh_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          scope?: string | null
          connected_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          provider?: string
          environment?: string
          access_token_ciphertext?: string | null
          refresh_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          scope?: string | null
          connected_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_authority_requests: {
        Row: {
          id: string
          business_id: string
          document_id: string
          request_kind: string
          idempotency_key: string
          status: string
          external_reference: string | null
          response_payload: Json | null
          error_code: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          document_id: string
          request_kind: string
          idempotency_key: string
          status?: string
          external_reference?: string | null
          response_payload?: Json | null
          error_code?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          document_id?: string
          request_kind?: string
          idempotency_key?: string
          status?: string
          external_reference?: string | null
          response_payload?: Json | null
          error_code?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      has_business_role: {
        Args: {
          _business_id: string
          _roles: Database["public"]["Enums"]["business_role"][]
        }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
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
      reserve_document_number: {
        Args: { _document_id: string }
        Returns: string
      }
      issue_document: {
        Args: { _document_id: string }
        Returns: Database["public"]["Tables"]["documents"]["Row"]
      }
      calculate_document_totals: {
        Args: { p_document_id: string }
        Returns: { subtotal: number; vat_amount: number; total_amount: number }[]
      }
      begin_tax_authority_request: {
        Args: { _document_id: string; _idempotency_key: string }
        Returns: Database["public"]["Tables"]["tax_authority_requests"]["Row"]
      }
      get_tax_authority_connection_status: {
        Args: {
          _business_id: string
          _environment: string
        }
        Returns: {
          connected: boolean
          environment: string
          connected_at: string
          expires_at: string | null
          scope: string | null
        }[]
      }
      update_tax_authority_request: {
        Args: { _request_id: string; _status: string; _external_reference?: string | null; _response_payload?: Json | null; _error_code?: string | null; _error_message?: string | null }
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
