import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Status = "unsupported" | "default" | "granted" | "denied";

export const usePushNotifications = (userId: string, businessId: string) => {
  const [status, setStatus] = useState<Status>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setStatus("unsupported");
      return;
    }

    setStatus(Notification.permission as Status);

    const ua = navigator.userAgent;
    setIsIOSSafari(
      /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
    );
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    );

    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      })
      .catch(() => {});
  }, []);

  const enable = async (): Promise<{ success: boolean; reason?: string }> => {
    if (status === "unsupported") return { success: false, reason: "unsupported" };
    if (isIOSSafari && !isStandalone) return { success: false, reason: "ios-needs-homescreen" };

    const permission = await Notification.requestPermission();
    setStatus(permission as Status);
    if (permission !== "granted") return { success: false, reason: "denied" };

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey) return { success: false, reason: "not-configured" };

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = sub.toJSON();
      const { error } = await supabase.functions.invoke("save-push-subscription", {
        body: {
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          userId,
          businessId,
          userAgent: navigator.userAgent,
        },
      });

      if (error) return { success: false, reason: "save-failed" };
      setIsSubscribed(true);
      return { success: true };
    } catch {
      return { success: false, reason: "subscribe-failed" };
    }
  };

  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await supabase.from("push_subscriptions" as never).delete().eq("endpoint", sub.endpoint);
      }
    } catch {
      // ignore
    }
    setIsSubscribed(false);
  };

  const sendTest = async () => {
    return supabase.functions.invoke("send-push-notification", {
      body: {
        businessId,
        title: "Test notification",
        body: "Push notifications are working correctly.",
        tag: "test",
      },
    });
  };

  return { status, isSubscribed, isIOSSafari, isStandalone, enable, disable, sendTest };
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
