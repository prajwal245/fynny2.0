import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fynhelp.app",
  appName: "FYNHelp",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#F4EDDA",
      androidSplashResourceName: "splash",
      iosSpinnerStyle: "small",
      spinnerColor: "#C41E1E",
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#1A1008",
    },
  },
};

export default config;
