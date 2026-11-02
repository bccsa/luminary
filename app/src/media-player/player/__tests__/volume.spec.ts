import { describe, expect, it } from 'vitest';
import { VOLUME_STEP, stepVolume } from '../src/ui/volume';

describe('stepVolume', () => {
    it('moves a tenth of the range', () => {
        expect(VOLUME_STEP).toBe(0.1);
        expect(stepVolume(0.5, 1)).toBe(0.6);
        expect(stepVolume(0.5, -1)).toBe(0.4);
    });

    it('does not drift: three presses up from silence read 0.3, not 0.30000000000000004', () => {
        let v = 0;
        for (let i = 0; i < 3; i++) v = stepVolume(v, 1);
        expect(v).toBe(0.3);
    });

    it('arrives back where it started after as many presses the other way, short of either end', () => {
        let v = 0.5;
        for (let i = 0; i < 4; i++) v = stepVolume(v, 1);
        for (let i = 0; i < 4; i++) v = stepVolume(v, -1);
        expect(v).toBe(0.5);
    });

    it('stops at both ends of the range the media element accepts', () => {
        expect(stepVolume(1, 1)).toBe(1);
        expect(stepVolume(0.95, 1)).toBe(1);
        expect(stepVolume(0, -1)).toBe(0);
        expect(stepVolume(0.04, -1)).toBe(0);
    });

    it('starts from silence when the current volume is not a number', () => {
        expect(stepVolume(NaN, 1)).toBe(0.1);
        expect(stepVolume(Infinity, -1)).toBe(0);
    });

    it('takes a step of its own', () => {
        expect(stepVolume(0.5, 1, 0.25)).toBe(0.75);
    });
});
