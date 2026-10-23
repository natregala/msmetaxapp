export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      businesses: {
        Row: {
          activity: string | null;
          created_at: string;
          currency: string;
          id: string;
          ledger_version: number;
          name: string;
          owner_id: string;
          profile_revision: number;
          setup_completed_at: string | null;
          timezone: string;
        };
        Insert: {
          activity?: string | null;
          created_at?: string;
          currency?: string;
          id: string;
          ledger_version?: number;
          name: string;
          owner_id: string;
          profile_revision?: number;
          setup_completed_at?: string | null;
          timezone?: string;
        };
        Update: {
          activity?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          ledger_version?: number;
          name?: string;
          owner_id?: string;
          profile_revision?: number;
          setup_completed_at?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      document_row_acceptances: {
        Row: {
          accepted_at: string;
          actor_id: string;
          business_id: string;
          document_id: string;
          row_id: string;
          transaction_id: string;
        };
        Insert: {
          accepted_at?: string;
          actor_id: string;
          business_id: string;
          document_id: string;
          row_id: string;
          transaction_id: string;
        };
        Update: {
          accepted_at?: string;
          actor_id?: string;
          business_id?: string;
          document_id?: string;
          row_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_row_acceptances_business_id_document_id_fkey";
            columns: ["business_id", "document_id"];
            isOneToOne: false;
            referencedRelation: "source_documents";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "document_row_acceptances_business_id_transaction_id_fkey";
            columns: ["business_id", "transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      ledger_snapshots: {
        Row: {
          actor_id: string;
          business_id: string;
          command: Json;
          created_at: string;
          id: string;
          ledger_version: number;
          snapshot: Json;
        };
        Insert: {
          actor_id: string;
          business_id: string;
          command: Json;
          created_at?: string;
          id: string;
          ledger_version: number;
          snapshot: Json;
        };
        Update: {
          actor_id?: string;
          business_id?: string;
          command?: Json;
          created_at?: string;
          id?: string;
          ledger_version?: number;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_snapshots_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      preparation_profiles: {
        Row: {
          business_id: string;
          profile_data: Json;
          revision: number;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          profile_data: Json;
          revision: number;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          profile_data?: Json;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "preparation_profiles_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      source_documents: {
        Row: {
          business_id: string;
          byte_size: number;
          created_at: string;
          created_by: string;
          failure_code: string | null;
          id: string;
          mime_type: string;
          object_path: string;
          original_extraction: Json | null;
          proposals: Json;
          revision: number;
          sha256: string;
          source_type: string;
          state: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          byte_size: number;
          created_at?: string;
          created_by: string;
          failure_code?: string | null;
          id: string;
          mime_type: string;
          object_path: string;
          original_extraction?: Json | null;
          proposals?: Json;
          revision?: number;
          sha256: string;
          source_type: string;
          state?: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          byte_size?: number;
          created_at?: string;
          created_by?: string;
          failure_code?: string | null;
          id?: string;
          mime_type?: string;
          object_path?: string;
          original_extraction?: Json | null;
          proposals?: Json;
          revision?: number;
          sha256?: string;
          source_type?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_documents_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_payments: {
        Row: {
          amount_centavos: number;
          business_id: string;
          id: string;
          payment_date: string | null;
          recorded_at: string;
          recorded_by: string;
          revision: number;
          status: string;
          transaction_id: string;
        };
        Insert: {
          amount_centavos: number;
          business_id: string;
          id?: string;
          payment_date?: string | null;
          recorded_at?: string;
          recorded_by: string;
          revision?: number;
          status?: string;
          transaction_id: string;
        };
        Update: {
          amount_centavos?: number;
          business_id?: string;
          id?: string;
          payment_date?: string | null;
          recorded_at?: string;
          recorded_by?: string;
          revision?: number;
          status?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_payments_business_id_transaction_id_fkey";
            columns: ["business_id", "transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      transaction_sources: {
        Row: {
          business_id: string;
          document_id: string;
          row_id: string;
          source_type: string;
          transaction_id: string;
        };
        Insert: {
          business_id: string;
          document_id: string;
          row_id: string;
          source_type: string;
          transaction_id: string;
        };
        Update: {
          business_id?: string;
          document_id?: string;
          row_id?: string;
          source_type?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_sources_business_id_transaction_id_fkey";
            columns: ["business_id", "transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount_centavos: number;
          business_date: string;
          business_id: string;
          currency: string;
          description: string | null;
          id: string;
          kind: string;
          money_movement: string;
          payment_knowledge: string;
          recorded_at: string;
          recorded_by: string;
          review_status: string;
          revision: number;
          source: string;
          status: string;
        };
        Insert: {
          amount_centavos: number;
          business_date: string;
          business_id: string;
          currency?: string;
          description?: string | null;
          id?: string;
          kind: string;
          money_movement: string;
          payment_knowledge?: string;
          recorded_at?: string;
          recorded_by: string;
          review_status?: string;
          revision?: number;
          source?: string;
          status?: string;
        };
        Update: {
          amount_centavos?: number;
          business_date?: string;
          business_id?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          kind?: string;
          money_movement?: string;
          payment_knowledge?: string;
          recorded_at?: string;
          recorded_by?: string;
          review_status?: string;
          revision?: number;
          source?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_manual_transaction: {
        Args: {
          p_business_id: string;
          p_operation_id: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      create_business: {
        Args: { p_business_id: string; p_name: string };
        Returns: Json;
      };
      create_guided_business: {
        Args: { p_activity: string; p_business_id: string; p_name: string };
        Returns: Json;
      };
      document_command: {
        Args: {
          p_action: string;
          p_business_id: string;
          p_document_id: string;
          p_expected_revision: number;
          p_operation_id: string;
          p_values: Json;
        };
        Returns: Json;
      };
      document_provider_job: {
        Args: {
          p_business_id: string;
          p_document_id: string;
          p_operation_url?: string;
        };
        Returns: string;
      };
      document_read: {
        Args: { p_business_id: string; p_document_id?: string };
        Returns: Json;
      };
      ledger_detail: {
        Args: { p_business_id: string; p_record_id: string };
        Returns: Json;
      };
      ledger_list: {
        Args: { p_business_id: string; p_filters: Json };
        Returns: Json;
      };
      ledger_mutate: {
        Args: {
          p_action: string;
          p_business_id: string;
          p_expected_revision: number;
          p_operation_id: string;
          p_record_id: string;
          p_values: Json;
        };
        Returns: Json;
      };
      ledger_read_snapshot: {
        Args: { p_business_id: string; p_snapshot_id: string };
        Returns: Json;
      };
      ledger_snapshot: {
        Args: {
          p_business_id: string;
          p_from: string;
          p_operation_id: string;
          p_preparation?: Json;
          p_to: string;
        };
        Returns: Json;
      };
      ledger_summary: {
        Args: { p_business_id: string; p_from: string; p_to: string };
        Returns: Json;
      };
      rename_business: {
        Args: {
          p_business_id: string;
          p_expected_revision: number;
          p_name: string;
        };
        Returns: Json;
      };
      save_preparation_profile: {
        Args: {
          p_business_id: string;
          p_expected_revision: number;
          p_operation_id: string;
          p_values: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
