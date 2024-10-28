import { registerPlugin } from "@capacitor/core";

export type AuthBrowserPlugin = {
    open(options: { url: string }): Promise<{ result: string }>;
};

const AuthBrowser = registerPlugin<AuthBrowserPlugin>("AuthBrowser");

export default AuthBrowser;
