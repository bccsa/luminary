import { registerPlugin } from '@capacitor/core';

export interface AuthBrowserPlugin {
	open(options: { url: string }): Promise<{ result: string }>;
}

const AuthBrowser = registerPlugin<AuthBrowserPlugin>('AuthBrowser');

export default AuthBrowser;
