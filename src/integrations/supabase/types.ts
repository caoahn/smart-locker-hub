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
      alerts: {
        Row: {
          box_id: number | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          type: string
        }
        Insert: {
          box_id?: number | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          type: string
        }
        Update: {
          box_id?: number | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          type?: string
        }
        Relationships: []
      }
      lockers: {
        Row: {
          id: number
          status: string
          updated_at: string
        }
        Insert: {
          id: number
          status?: string
          updated_at?: string
        }
        Update: {
          id?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          box_id: number
          completed_at: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          deleted_at: string | null
          deposited_at: string | null
          failure_reason: string | null
          id: string
          is_paid: boolean
          otp_code: string | null
          otp_expires_at: string | null
          otp_used_at: string | null
          picked_up_at: string | null
          pickup_started_at: string | null
          reservation_expires_at: string | null
          shipper_id: string | null
          start_time: string
          status: string
          total_amount: number
          user_phone: string
        }
        Insert: {
          box_id: number
          completed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deposited_at?: string | null
          failure_reason?: string | null
          id?: string
          is_paid?: boolean
          otp_code?: string | null
          otp_expires_at?: string | null
          otp_used_at?: string | null
          picked_up_at?: string | null
          pickup_started_at?: string | null
          reservation_expires_at?: string | null
          shipper_id?: string | null
          start_time?: string
          status?: string
          total_amount?: number
          user_phone: string
        }
        Update: {
          box_id?: number
          completed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deposited_at?: string | null
          failure_reason?: string | null
          id?: string
          is_paid?: boolean
          otp_code?: string | null
          otp_expires_at?: string | null
          otp_used_at?: string | null
          picked_up_at?: string | null
          pickup_started_at?: string | null
          reservation_expires_at?: string | null
          shipper_id?: string | null
          start_time?: string
          status?: string
          total_amount?: number
          user_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "lockers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          content: string
          created_at: string
          customer_id: string | null
          id: string
          order_id: string | null
          recipient_email: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          channel?: string
          content: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
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
          display_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          account_name: string | null
          bank_account: string | null
          bank_code: string | null
          base_fee: number
          base_hours: number
          id: number
          overdue_fee: number
          overdue_hours: number
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          bank_account?: string | null
          bank_code?: string | null
          base_fee?: number
          base_hours?: number
          id?: number
          overdue_fee?: number
          overdue_hours?: number
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          bank_account?: string | null
          bank_code?: string | null
          base_fee?: number
          base_hours?: number
          id?: number
          overdue_fee?: number
          overdue_hours?: number
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_force_reset_locker: {
        Args: { _box_id: number; _message: string | null }
        Returns: {
          box_id: number
          completed: boolean
          reason: string
        }[]
      }
      confirm_dropoff_closed: {
        Args: { _box_id: number }
        Returns: {
          box_id: number
          notification_id: string | null
          order_id: string
          otp_code: string
          otp_expires_at: string
        }[]
      }
      confirm_pickup_closed: {
        Args: { _box_id: number }
        Returns: {
          completed: boolean
          order_id: string | null
          reason: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_orders_by_phone: {
        Args: { _phone: string }
        Returns: {
          box_id: number
          id: string
          is_paid: boolean
          start_time: string
          status: string
          total_amount: number
        }[]
      }
      mark_dropoff_open_failed: {
        Args: { _order_id: string; _reason: string | null }
        Returns: {
          box_id: number
          locker_status: string
          order_id: string
          order_status: string
        }[]
      }
      mark_pickup_open_failed: {
        Args: { _order_id: string; _reason: string | null }
        Returns: {
          box_id: number
          locker_status: string
          order_id: string
          order_status: string
        }[]
      }
      request_dropoff_open: {
        Args: { _order_id: string }
        Returns: {
          box_id: number
          locker_status: string
          order_id: string
          order_status: string
        }[]
      }
      reserve_locker_for_dropoff: {
        Args: {
          _box_id: number
          _customer_email: string | null
          _customer_phone: string
        }
        Returns: {
          box_id: number
          locker_status: string
          order_id: string
          order_status: string
          reservation_expires_at: string
        }[]
      }
      verify_pickup_otp: {
        Args: { _box_id: number; _otp: string }
        Returns: {
          allowed: boolean
          is_paid: boolean | null
          order_id: string | null
          reason: string
          total_amount: number | null
        }[]
      }
      verify_otp: {
        Args: { _box_id: number; _otp: string }
        Returns: {
          is_paid: boolean
          order_id: string
          total_amount: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "shipper" | "customer"
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
      app_role: ["admin", "shipper", "customer"],
    },
  },
} as const
