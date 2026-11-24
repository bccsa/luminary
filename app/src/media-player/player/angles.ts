import { AUDIO_ONLY_ANGLE_ID, type Angle } from "@luminary-media-converter/player-web";

/** A camera to offer: the angle's id, and its name as the menus show it. */
export interface CameraChoice {
    id: string;
    label: string;
}

/**
 * The video's cameras by the names the master gives them, with a capital ("Pulpit"). The sound-only
 * rendering is the Watch/Listen choice, not a camera, so it is left out.
 */
export function cameraChoices(angles: readonly Angle[]): CameraChoice[] {
    return angles
        .filter((angle) => angle.id !== AUDIO_ONLY_ANGLE_ID)
        .map((angle) => ({
            id: angle.id,
            label: angle.name
                ? angle.name.charAt(0).toLocaleUpperCase() + angle.name.slice(1)
                : angle.name,
        }));
}
