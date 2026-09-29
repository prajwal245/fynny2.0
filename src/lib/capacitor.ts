import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { PushNotifications } from "@capacitor/push-notifications";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

export async function initMobileApp() {
  if (!isNative) return;

  App.addListener("backButton", ({ canGoBack }) => {
    if (!canGoBack) App.exitApp();
    else window.history.back();
  });

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export async function registerPushNotifications(userId: string): Promise<boolean> {
  if (!isNative) return false;

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== "granted") return false;

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token) => {
      const { error } = await (supabase.from as any)("push_tokens").upsert(
        { user_id: userId, token: token.value, platform, updated_at: new Date().toISOString() },
        { onConflict: "user_id,platform" }
      );
      if (error) console.error("Push token save error:", error.message);
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("Push registration error:", err.error);
    });

    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("Push received:", notification.title);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action.notification.data;
      if (data?.route) window.location.href = data.route;
    });

    return true;
  } catch (err) {
    console.error("Push notification setup failed:", err);
    return false;
  }
}

export async function hapticFeedback(style: "light" | "medium" | "heavy" = "light") {
  if (!isNative) return;
  const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
  await Haptics.impact({ style: map[style] });
}

export async function getNetworkStatus(): Promise<{ connected: boolean; connectionType: string }> {
  const status = await Network.getStatus();
  return { connected: status.connected, connectionType: status.connectionType };
}

export function onNetworkChange(cb: (connected: boolean) => void): () => void {
  const handle = Network.addListener("networkStatusChange", (status) => {
    cb(status.connected);
  });
  return () => {
    handle.then((h) => h.remove());
  };
}
