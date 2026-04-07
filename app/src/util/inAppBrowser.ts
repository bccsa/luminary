export function isTelegramInAppBrowser(userAgent?: string): boolean {
    const ua = (userAgent ?? navigator.userAgent ?? "").toLowerCase();
    // Telegram in-app browser UA typically contains "Telegram"
    return ua.includes("telegram");
}

