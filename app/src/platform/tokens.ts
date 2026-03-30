import type { InjectionKey } from "vue";
import type { MediaPlayerService } from "./contracts/media-player";

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("MediaPlayerService");
