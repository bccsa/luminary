import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "africa.activechristianity.app",
    appName: "ActiveChristianity",
    webDir: "dist",
    server: {
        androidScheme: "https",
    },
};

export default config;
