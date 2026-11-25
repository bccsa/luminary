import type { InjectionKey } from "vue";
import type { ShareService } from "./contract";

export const ShareKey: InjectionKey<ShareService> = Symbol("ShareService");
