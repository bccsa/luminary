import { describe, expect, it } from "vitest";
import { rgbaToThumbHash, thumbHashToRGBA } from "thumbhash";
import cases from "../cases.json";
import { WASH_CHROMA, WASH_FLATTEN, luma, lpqToRgb, washAt, washAverage, washOf, type WashTone } from "../thumbHashWash";

const bytesOf = (hash: string) => Uint8Array.from(atob(hash), (char) => char.charCodeAt(0));

describe("thumbHashWash", () => {
    it("comes out as every platform's cases say", () => {
        for (const c of cases.cases) {
            const wash = washOf(bytesOf(c.hash), c.tone as WashTone)!;
            expect(Math.abs(wash.gain - c.gain), c.name).toBeLessThanOrEqual(cases.tolerance);
            expect(Math.abs(wash.aspect - c.aspect), c.name).toBeLessThanOrEqual(cases.tolerance);
            washAverage(wash).forEach((v, i) => expect(Math.abs(v - c.average[i]!)).toBeLessThanOrEqual(cases.tolerance));
            for (const [surface, u, v, ...rgb] of c.samples) {
                washAt(wash, u!, v!, surface!).forEach((value, i) =>
                    expect(Math.abs(value - rgb[i]!), `${c.name} on ${surface} at ${u},${v}`).toBeLessThanOrEqual(cases.tolerance),
                );
            }
        }
    });

    it("keeps a bright top over a dark foot a gentle shift, not ThumbHash's own hard step", () => {
        const w = 32;
        const h = 32;
        const rgba = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const v = y < h / 2 ? 240 : 10;
                rgba.set([v, v, v, 255], (y * w + x) * 4);
            }
        }
        const wash = washOf(rgbaToThumbHash(w, h, rgba))!;
        const top = luma(...washAt(wash, 0.5, 0.05, wash.aspect));
        const foot = luma(...washAt(wash, 0.5, 0.95, wash.aspect));
        // Behind a video only the edges of the wash show: a top many times brighter than the foot reads as a hard
        // edge there instead of a fade.
        expect(top).toBeGreaterThan(foot);
        expect(top / foot).toBeLessThan(2);
    });

    it("reads a hash as ThumbHash itself does: its sum, unflattened and unlifted, is ThumbHash's picture", () => {
        for (const { hash } of cases.cases) {
            const bytes = bytesOf(hash);
            const wash = washOf(bytes)!;
            const reference = thumbHashToRGBA(bytes);
            for (let y = 0; y < reference.h; y += 3) {
                for (let x = 0; x < reference.w; x += 3) {
                    const u = (x + 0.5) / reference.w;
                    const v = (y + 0.5) / reference.h;
                    let [l, p, q] = [wash.base[0], wash.base[1] / WASH_CHROMA, wash.base[2] / WASH_CHROMA];
                    for (const [cx, cy, w] of wash.l) l += (w / WASH_FLATTEN) * Math.cos(Math.PI * cx * u) * Math.cos(Math.PI * cy * v);
                    for (const [cx, cy, wp, wq] of wash.pq) {
                        const f = Math.cos(Math.PI * cx * u) * Math.cos(Math.PI * cy * v);
                        p += (wp / WASH_CHROMA) * f;
                        q += (wq / WASH_CHROMA) * f;
                    }
                    const rgb = lpqToRgb(l, p, q);
                    const i = (y * reference.w + x) * 4;
                    rgb.forEach((value, c) => expect(Math.abs(Math.floor(value * 255) - reference.rgba[i + c]!)).toBeLessThanOrEqual(1));
                }
            }
        }
    });
});
