import type { InjectionKey } from "vue";
import type { VideoPlayerService } from "./contract";

export const VideoPlayerKey: InjectionKey<VideoPlayerService> = Symbol("VideoPlayerService");
