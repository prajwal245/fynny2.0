import { useEffect, useState } from "react";
import { onNetworkChange, getNetworkStatus } from "@/lib/capacitor";

export function useNetworkStatus() {
  const [connected, setConnected] = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getNetworkStatus().then((s) => {
      setConnected(s.connected);
      setChecking(false);
    });
    const cleanup = onNetworkChange(setConnected);
    return cleanup;
  }, []);

  return { connected, checking };
}
