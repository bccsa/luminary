<script setup lang="ts">
/**
 * A ThumbHash drawn as the wash (see `thumbHashWash.ts`), filling its positioned parent edge to edge: per pixel in a
 * WebGL shader, else from the same function at a quarter of the size, which the browser draws smoothly over the box.
 * Static: it draws again only when its size or hash changes.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
    WASH_FADE,
    WASH_MAX_L_TERMS,
    WASH_PQ_TERMS,
    washAt,
    washOf,
    type Wash,
    type WashTone,
} from "./thumbHashWash";

const props = withDefaults(defineProps<{ hash?: string; tone?: WashTone }>(), {
    hash: undefined,
    tone: "dark",
});

const canvas = ref<HTMLCanvasElement | null>(null);
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let observer: ResizeObserver | null = null;

/** The wash at each pixel, as `washAt`; terms past a hash's own have no weight. A static dither stops smooth bands. */
const FRAGMENT = `
precision highp float;
uniform vec2 size;
uniform vec3 base;
uniform vec3 lt[${WASH_MAX_L_TERMS}];
uniform vec4 pq[${WASH_PQ_TERMS}];
uniform float gain;
uniform float aspect;
uniform float fade;
const float PI = 3.14159265358979;
void main() {
    vec2 xy = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
    // The hash fits in the box in its own proportions; past its edges it fades into its average.
    vec2 uv = xy / size;
    float surface = size.x / size.y;
    if (surface > aspect) uv.x = 0.5 + (uv.x - 0.5) * (surface / aspect);
    else uv.y = 0.5 + (uv.y - 0.5) * (aspect / surface);
    float past = max(max(max(-uv.x, uv.x - 1.0), max(-uv.y, uv.y - 1.0)), 0.0);
    uv = clamp(uv, 0.0, 1.0);
    float l = base.x;
    float p = base.y;
    float q = base.z;
    for (int i = 0; i < ${WASH_MAX_L_TERMS}; i++) {
        vec3 t = lt[i];
        l += t.z * cos(PI * t.x * uv.x) * cos(PI * t.y * uv.y);
    }
    for (int i = 0; i < ${WASH_PQ_TERMS}; i++) {
        vec4 t = pq[i];
        float f = cos(PI * t.x * uv.x) * cos(PI * t.y * uv.y);
        p += t.z * f;
        q += t.w * f;
    }
    float k = smoothstep(0.0, fade, past);
    l = mix(l, base.x, k);
    p = mix(p, base.y, k);
    q = mix(q, base.z, k);
    float b = l - 2.0 / 3.0 * p;
    float r = (3.0 * l - b + q) / 2.0;
    float g = r - q;
    vec3 c = clamp(vec3(r, g, b) * gain, 0.0, 1.0);
    float n = fract(sin(dot(xy, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor = vec4(clamp(c + (n - 0.5) / 255.0, 0.0, 1.0), 1.0);
}`;
const VERTEX = `attribute vec2 at; void main() { gl_Position = vec4(at, 0.0, 1.0); }`;

function decoded(): Wash | null {
    if (!props.hash) return null;
    try {
        return washOf(
            Uint8Array.from(atob(props.hash), (char) => char.charCodeAt(0)),
            props.tone,
        );
    } catch {
        return null;
    }
}

function setUp(element: HTMLCanvasElement): boolean {
    if (program) return true;
    gl = element.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) return false;
    const compile = (type: number, source: string) => {
        const shader = gl!.createShader(type)!;
        gl!.shaderSource(shader, source);
        gl!.compileShader(shader);
        return shader;
    };
    const made = gl.createProgram()!;
    gl.attachShader(made, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(made, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(made);
    if (!gl.getProgramParameter(made, gl.LINK_STATUS)) {
        gl = null;
        return false;
    }
    program = made;
    gl.useProgram(made);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(made, "at");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    return true;
}

function drawShader(wash: Wash, width: number, height: number) {
    const context = gl!;
    const where = (name: string) => context.getUniformLocation(program!, name);
    const lt = new Float32Array(WASH_MAX_L_TERMS * 3);
    wash.l.forEach((term, i) => lt.set(term, i * 3));
    const pq = new Float32Array(WASH_PQ_TERMS * 4);
    wash.pq.forEach((term, i) => pq.set(term, i * 4));
    context.viewport(0, 0, width, height);
    context.uniform2f(where("size"), width, height);
    context.uniform3f(where("base"), ...wash.base);
    context.uniform3fv(where("lt"), lt);
    context.uniform4fv(where("pq"), pq);
    context.uniform1f(where("gain"), wash.gain);
    context.uniform1f(where("fade"), WASH_FADE);
    context.uniform1f(where("aspect"), wash.aspect);
    context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
}

/** The function is a few slow waves: a quarter of the size, drawn smoothly, is the same to the eye. */
function drawSmall(element: HTMLCanvasElement, wash: Wash, width: number, height: number) {
    const w = Math.max(2, Math.round(Math.min(width / 4, (160 * width) / Math.max(width, height))));
    const h = Math.max(2, Math.round((w * height) / width));
    element.width = w;
    element.height = h;
    const context = element.getContext("2d");
    if (!context) return;
    const image = context.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [r, g, b] = washAt(wash, (x + 0.5) / w, (y + 0.5) / h, width / height);
            const i = (y * w + x) * 4;
            image.data[i] = Math.round(r * 255);
            image.data[i + 1] = Math.round(g * 255);
            image.data[i + 2] = Math.round(b * 255);
            image.data[i + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
}

function draw() {
    const element = canvas.value;
    const wash = decoded();
    if (!element || !wash) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(element.clientWidth * ratio));
    const height = Math.max(1, Math.round(element.clientHeight * ratio));
    if (setUp(element)) {
        element.width = width;
        element.height = height;
        drawShader(wash, width, height);
    } else {
        drawSmall(element, wash, width, height);
    }
}

onMounted(() => {
    draw();
    if (typeof ResizeObserver !== "undefined" && canvas.value) {
        observer = new ResizeObserver(draw);
        observer.observe(canvas.value);
    }
});
watch(() => [props.hash, props.tone], draw);
onBeforeUnmount(() => {
    observer?.disconnect();
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
});
</script>

<template>
    <canvas
        v-if="hash"
        ref="canvas"
        class="thumbhash-wash"
        aria-hidden="true"
        data-test="thumbHashWash"
    />
</template>

<style scoped>
.thumbhash-wash {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
}
</style>
