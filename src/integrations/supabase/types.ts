export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      discount_requests: {
        Row: {
          applies_to: string;
          approve_token: string;
          approved_at: string | null;
          associate_name: string;
          code: string;
          created_at: string;
          description: string | null;
          discount_type: string;
          discount_value: number;
          error_message: string | null;
          expires_at: string | null;
          id: string;
          location: string;
          membership_ids: number[];
          membership_names: string[];
          momence_response: Json | null;
          notes: string | null;
          reason: string;
          reject_token: string;
          renewal_limit_type: string;
          renewals_count: number | null;
          requested_by: string | null;
          status: Database["public"]["Enums"]["discount_status"];
          updated_at: string;
          usage_amount: number | null;
          usage_limit_type: string;
        };
        Insert: {
          applies_to: string;
          approve_token?: string;
          approved_at?: string | null;
          associate_name: string;
          code: string;
          created_at?: string;
          description?: string | null;
          discount_type: string;
          discount_value: number;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          location: string;
          membership_ids?: number[];
          membership_names?: string[];
          momence_response?: Json | null;
          notes?: string | null;
          reason: string;
          reject_token?: string;
          renewal_limit_type: string;
          renewals_count?: number | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["discount_status"];
          updated_at?: string;
          usage_amount?: number | null;
          usage_limit_type: string;
        };
        Update: {
          applies_to?: string;
          approve_token?: string;
          approved_at?: string | null;
          associate_name?: string;
          code?: string;
          created_at?: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          location?: string;
          membership_ids?: number[];
          membership_names?: string[];
          momence_response?: Json | null;
          notes?: string | null;
          reason?: string;
          reject_token?: string;
          renewal_limit_type?: string;
          renewals_count?: number | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["discount_status"];
          updated_at?: string;
          usage_amount?: number | null;
          usage_limit_type?: string;
        };
        Relationships: [];
      };
      momence_session: {
        Row: {
          cookie: string;
          device_cookie: string | null;
          id: string;
          signed_in_at: string;
          updated_at: string;
        };
        Insert: {
          cookie: string;
          device_cookie?: string | null;
          id?: string;
          signed_in_at?: string;
          updated_at?: string;
        };
        Update: {
          cookie?: string;
          device_cookie?: string | null;
          id?: string;
          signed_in_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_link_requests: {
        Row: {
          adjustable_quantity: boolean;
          after_completion_message: string | null;
          after_completion_redirect_url: string | null;
          after_completion_type: string;
          allow_promotion_codes: boolean;
          approve_token: string;
          approved_at: string | null;
          checkout_session_ids: string[];
          collect_address: boolean;
          collect_phone: boolean;
          created_at: string;
          created_by: string | null;
          currency: string;
          custom_coupon_id: string | null;
          custom_fields: Json;
          custom_promo_type: string | null;
          custom_promo_value: number | null;
          custom_promotion_code_id: string | null;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          description: string | null;
          error_message: string | null;
          id: string;
          internal_note: string | null;
          last_event: Json | null;
          last_payment_at: string | null;
          line_items: Json;
          link_expires_at: string | null;
          max_redemptions: number | null;
          momence_member_details: Json | null;
          momence_member_id: string | null;
          payment_count: number;
          product_name: string;
          promotion_code: string | null;
          promotion_code_id: string | null;
          promotion_code_snapshot: Json | null;
          purpose: string | null;
          quantity: number;
          reject_token: string;
          requested_amount: number;
          single_use: boolean;
          status: Database["public"]["Enums"]["payment_link_status"];
          stripe_payment_link_id: string | null;
          stripe_payment_link_url: string | null;
          stripe_price_id: string;
          stripe_product_id: string | null;
          stripe_response: Json | null;
          total_paid_amount: number;
          unit_amount: number;
          updated_at: string;
          utm_parameters: Json;
        };
        Insert: {
          adjustable_quantity?: boolean;
          after_completion_message?: string | null;
          after_completion_redirect_url?: string | null;
          after_completion_type?: string;
          allow_promotion_codes?: boolean;
          approve_token?: string;
          approved_at?: string | null;
          checkout_session_ids?: string[];
          collect_address?: boolean;
          collect_phone?: boolean;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_coupon_id?: string | null;
          custom_fields?: Json;
          custom_promo_type?: string | null;
          custom_promo_value?: number | null;
          custom_promotion_code_id?: string | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          description?: string | null;
          error_message?: string | null;
          id?: string;
          internal_note?: string | null;
          last_event?: Json | null;
          last_payment_at?: string | null;
          line_items?: Json;
          link_expires_at?: string | null;
          max_redemptions?: number | null;
          momence_member_details?: Json | null;
          momence_member_id?: string | null;
          payment_count?: number;
          product_name: string;
          promotion_code?: string | null;
          promotion_code_id?: string | null;
          promotion_code_snapshot?: Json | null;
          purpose?: string | null;
          quantity?: number;
          reject_token?: string;
          requested_amount?: number;
          single_use?: boolean;
          status?: Database["public"]["Enums"]["payment_link_status"];
          stripe_payment_link_id?: string | null;
          stripe_payment_link_url?: string | null;
          stripe_price_id: string;
          stripe_product_id?: string | null;
          stripe_response?: Json | null;
          total_paid_amount?: number;
          unit_amount?: number;
          updated_at?: string;
          utm_parameters?: Json;
        };
        Update: {
          adjustable_quantity?: boolean;
          after_completion_message?: string | null;
          after_completion_redirect_url?: string | null;
          after_completion_type?: string;
          allow_promotion_codes?: boolean;
          approve_token?: string;
          approved_at?: string | null;
          checkout_session_ids?: string[];
          collect_address?: boolean;
          collect_phone?: boolean;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          custom_coupon_id?: string | null;
          custom_fields?: Json;
          custom_promo_type?: string | null;
          custom_promo_value?: number | null;
          custom_promotion_code_id?: string | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          description?: string | null;
          error_message?: string | null;
          id?: string;
          internal_note?: string | null;
          last_event?: Json | null;
          last_payment_at?: string | null;
          line_items?: Json;
          link_expires_at?: string | null;
          max_redemptions?: number | null;
          momence_member_details?: Json | null;
          momence_member_id?: string | null;
          payment_count?: number;
          product_name?: string;
          promotion_code?: string | null;
          promotion_code_id?: string | null;
          promotion_code_snapshot?: Json | null;
          purpose?: string | null;
          quantity?: number;
          reject_token?: string;
          requested_amount?: number;
          single_use?: boolean;
          status?: Database["public"]["Enums"]["payment_link_status"];
          stripe_payment_link_id?: string | null;
          stripe_payment_link_url?: string | null;
          stripe_price_id?: string;
          stripe_product_id?: string | null;
          stripe_response?: Json | null;
          total_paid_amount?: number;
          unit_amount?: number;
          updated_at?: string;
          utm_parameters?: Json;
        };
        Relationships: [];
      };
      stripe_payment_links: {
        Row: {
          adjustable_quantity: boolean;
          after_completion_message: string | null;
          after_completion_redirect_url: string | null;
          after_completion_type: string;
          allow_promotion_codes: boolean;
          amount: number;
          amount_collected: number | null;
          approve_token: string;
          approved_at: string | null;
          checkout_session_id: string | null;
          checkout_session_ids: string[];
          clicks: number;
          collect_address: boolean;
          collect_phone: boolean;
          completed_at: string | null;
          completed_sessions: number;
          coupon_id: string | null;
          created_at: string;
          created_by: string;
          currency: string;
          custom_coupon_id: string | null;
          custom_fields: Json;
          custom_promo_type: string | null;
          custom_promo_value: number | null;
          custom_promotion_code_id: string | null;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          description: string | null;
          error_message: string | null;
          id: string;
          internal_note: string | null;
          last_clicked_at: string | null;
          last_event: Json | null;
          last_payment_at: string | null;
          line_items: Json;
          link_expires_at: string | null;
          max_redemptions: number | null;
          metadata: Json | null;
          momence_member_details: Json | null;
          momence_member_id: string | null;
          name: string;
          payment_count: number;
          payment_intent_id: string | null;
          product_name: string | null;
          promotion_code: string | null;
          promotion_code_id: string | null;
          promotion_code_snapshot: Json | null;
          purpose: string | null;
          quantity: number;
          reject_token: string;
          requested_amount: number | null;
          single_use: boolean;
          status: string;
          stripe_link_id: string | null;
          stripe_payment_link_id: string | null;
          stripe_payment_link_url: string | null;
          stripe_price_id: string | null;
          stripe_product_id: string | null;
          stripe_response: Json | null;
          total_paid_amount: number;
          unit_amount: number | null;
          updated_at: string;
          url: string | null;
          utm_parameters: Json;
        };
        Insert: {
          adjustable_quantity?: boolean;
          after_completion_message?: string | null;
          after_completion_redirect_url?: string | null;
          after_completion_type?: string;
          allow_promotion_codes?: boolean;
          amount: number;
          amount_collected?: number | null;
          approve_token?: string;
          approved_at?: string | null;
          checkout_session_id?: string | null;
          checkout_session_ids?: string[];
          clicks?: number;
          collect_address?: boolean;
          collect_phone?: boolean;
          completed_at?: string | null;
          completed_sessions?: number;
          coupon_id?: string | null;
          created_at?: string;
          created_by: string;
          currency?: string;
          custom_coupon_id?: string | null;
          custom_fields?: Json;
          custom_promo_type?: string | null;
          custom_promo_value?: number | null;
          custom_promotion_code_id?: string | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          description?: string | null;
          error_message?: string | null;
          id?: string;
          internal_note?: string | null;
          last_clicked_at?: string | null;
          last_event?: Json | null;
          last_payment_at?: string | null;
          line_items?: Json;
          link_expires_at?: string | null;
          max_redemptions?: number | null;
          metadata?: Json | null;
          momence_member_details?: Json | null;
          momence_member_id?: string | null;
          name: string;
          payment_count?: number;
          payment_intent_id?: string | null;
          product_name?: string | null;
          promotion_code?: string | null;
          promotion_code_id?: string | null;
          promotion_code_snapshot?: Json | null;
          purpose?: string | null;
          quantity?: number;
          reject_token?: string;
          requested_amount?: number | null;
          single_use?: boolean;
          status?: string;
          stripe_link_id?: string | null;
          stripe_payment_link_id?: string | null;
          stripe_payment_link_url?: string | null;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          stripe_response?: Json | null;
          total_paid_amount?: number;
          unit_amount?: number | null;
          updated_at?: string;
          url?: string | null;
          utm_parameters?: Json;
        };
        Update: {
          adjustable_quantity?: boolean;
          after_completion_message?: string | null;
          after_completion_redirect_url?: string | null;
          after_completion_type?: string;
          allow_promotion_codes?: boolean;
          amount?: number;
          amount_collected?: number | null;
          approve_token?: string;
          approved_at?: string | null;
          checkout_session_id?: string | null;
          checkout_session_ids?: string[];
          clicks?: number;
          collect_address?: boolean;
          collect_phone?: boolean;
          completed_at?: string | null;
          completed_sessions?: number;
          coupon_id?: string | null;
          created_at?: string;
          created_by?: string;
          currency?: string;
          custom_coupon_id?: string | null;
          custom_fields?: Json;
          custom_promo_type?: string | null;
          custom_promo_value?: number | null;
          custom_promotion_code_id?: string | null;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          description?: string | null;
          error_message?: string | null;
          id?: string;
          internal_note?: string | null;
          last_clicked_at?: string | null;
          last_event?: Json | null;
          last_payment_at?: string | null;
          line_items?: Json;
          link_expires_at?: string | null;
          max_redemptions?: number | null;
          metadata?: Json | null;
          momence_member_details?: Json | null;
          momence_member_id?: string | null;
          name?: string;
          payment_count?: number;
          payment_intent_id?: string | null;
          product_name?: string | null;
          promotion_code?: string | null;
          promotion_code_id?: string | null;
          promotion_code_snapshot?: Json | null;
          purpose?: string | null;
          quantity?: number;
          reject_token?: string;
          requested_amount?: number | null;
          single_use?: boolean;
          status?: string;
          stripe_link_id?: string | null;
          stripe_payment_link_id?: string | null;
          stripe_payment_link_url?: string | null;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          stripe_response?: Json | null;
          total_paid_amount?: number;
          unit_amount?: number | null;
          updated_at?: string;
          url?: string | null;
          utm_parameters?: Json;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      discount_status: "pending" | "approved" | "rejected" | "failed";
      payment_link_status:
        | "pending"
        | "approved"
        | "rejected"
        | "created"
        | "paid"
        | "inactive"
        | "failed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      discount_status: ["pending", "approved", "rejected", "failed"],
      payment_link_status: [
        "pending",
        "approved",
        "rejected",
        "created",
        "paid",
        "inactive",
        "failed",
      ],
    },
  },
} as const;
