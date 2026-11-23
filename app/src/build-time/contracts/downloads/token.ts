import type { InjectionKey } from "vue";
import type { DownloadsService } from "./contract";

export const DownloadsKey: InjectionKey<DownloadsService> = Symbol("DownloadsService");
