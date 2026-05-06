import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database } from "./types";

type Tables = Database["public"]["Tables"];

export type AlertRow = Tables["alerts"]["Row"];
export type LockerRow = Tables["lockers"]["Row"];
export type OrderRow = Tables["orders"]["Row"];
export type SettingsRow = Tables["settings"]["Row"];
export type UserRoleRow = Tables["user_roles"]["Row"];

export type CreateOrderInput = Pick<OrderRow, "box_id" | "otp_code" | "user_phone" | "shipper_id" | "status">;
export type UpdateSettingsInput = Pick<
  SettingsRow,
  "base_fee" | "base_hours" | "overdue_fee" | "overdue_hours" | "bank_account" | "bank_code" | "account_name"
>;

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

export const authApi = {
  onAuthStateChange(callback: AuthListener) {
    return supabase.auth.onAuthStateChange(callback);
  },

  getSession() {
    return supabase.auth.getSession();
  },

  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  signUp(email: string, password: string, displayName: string, emailRedirectTo: string) {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: { display_name: displayName },
      },
    });
  },

  signOut() {
    return supabase.auth.signOut();
  },
};

export const roleApi = {
  getUserRoles(userId: string) {
    return supabase.from("user_roles").select("role").eq("user_id", userId);
  },
};

export const lockerApi = {
  listLockers() {
    return supabase.from("lockers").select("*").order("id");
  },

  markOccupied(lockerId: number) {
    return supabase
      .from("lockers")
      .update({ status: "occupied", updated_at: new Date().toISOString() })
      .eq("id", lockerId);
  },

  markEmpty(lockerId: number) {
    return supabase
      .from("lockers")
      .update({ status: "empty", updated_at: new Date().toISOString() })
      .eq("id", lockerId);
  },
};

export const orderApi = {
  listOrders() {
    return supabase.from("orders").select("*").order("created_at", { ascending: false });
  },

  createOrder(input: CreateOrderInput) {
    return supabase.from("orders").insert(input).select().single();
  },

  lookupByPhone(phone: string) {
    return supabase.rpc("lookup_orders_by_phone", { _phone: phone });
  },

  completeOrder(orderId: string) {
    return supabase
      .from("orders")
      .update({ status: "completed", picked_up_at: new Date().toISOString() })
      .eq("id", orderId);
  },

  confirmPaid(orderId: string, totalAmount: number) {
    return supabase
      .from("orders")
      .update({
        is_paid: true,
        total_amount: totalAmount,
        status: "completed",
        picked_up_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  },
};

export const settingsApi = {
  getSettings() {
    return supabase.from("settings").select("*").eq("id", 1).single();
  },

  updateSettings(input: UpdateSettingsInput) {
    return supabase
      .from("settings")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", 1);
  },
};

export const alertApi = {
  listAlerts(limit = 50) {
    return supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(limit);
  },

  createInfoAlert(boxId: number, message: string) {
    return supabase.from("alerts").insert({ box_id: boxId, type: "info", message });
  },

  markRead(alertId: string) {
    return supabase.from("alerts").update({ is_read: true }).eq("id", alertId);
  },
};

export const realtimeApi = {
  subscribeToAdminChanges(onChange: () => void) {
    const channel = supabase
      .channel("admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "lockers" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, onChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToLockerChanges(onChange: () => void) {
    const channel = supabase
      .channel("ship-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "lockers" }, onChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
