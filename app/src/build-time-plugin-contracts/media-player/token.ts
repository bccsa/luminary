import type { InjectionKey } from "vue";
import type { MediaPlayerService } from "./contract";

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("MediaPlayerService");
