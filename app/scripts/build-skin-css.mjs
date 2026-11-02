/**
 * Trims Video.js 10's default skin stylesheet to the rules this player can use, and minifies it.
 *
 * The skin's stylesheet (about 100 kB) styles every component v10 has — dialogs, chapters, tooltips, the
 * live controls, the audio skin — and only the buttons, icons, menus and sliders in `controlsHtml.ts` are
 * ours. Shipping all of it made the library three times its size. A rule is kept when something it
 * selects can appear in the markup: the controls rendered with every option on, and the component
 * templates. Anything v10 adds to the DOM at runtime that neither contains is named in
 * `skin-css-safelist.json`, which a test fills from the live page.
 *
 * Writes `src/generated/skin.css`, which `LuminaryPlayer.vue` imports. Run before every build and before the
 * demo; it is not committed.
 */
import { build, transform } from 'esbuild';
import { PurgeCSS } from 'purgecss';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const require = createRequire(import.meta.url);

const skinPath = require.resolve('@videojs/html/video/skin.css');
const skin = readFileSync(skinPath, 'utf8');

/** The controls as they render, with every option on, so no rule an option would need is dropped. */
async function renderControls() {
    const bundled = await build({
        entryPoints: [join(ROOT, 'src/ui/controlsHtml.ts')],
        bundle: true,
        format: 'esm',
        platform: 'node',
        write: false,
    });
    const code = bundled.outputFiles[0].text;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    return mod.buildControlsHtml(
        { audioMenu: true, subtitlesMenu: true, skipBackSeconds: 10, skipForwardSeconds: 10 },
        'skin'
    );
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * What this player is: the default theme, the video preset. The skin has rules for others, which PurgeCSS cannot
 * tell apart because they differ by attribute, and which this player can never match.
 */
const THEME = 'default';
const PRESET = 'video';

/**
 * Drops the selectors for any other theme or preset, and strips the two attributes this player always has
 * from the ones that remain. Nearly every selector in the skin opens with
 * `:where(.media-skin[data-theme="default"][data-preset="video"])`; with the attributes gone it is
 * `:where(.media-skin)`, which has the same specificity (none, inside `:where`) and so cannot change which
 * rule wins. Hundreds of repetitions of the longer form were a fifth of the file.
 */
function narrowToThisPlayer(css) {
    const root = postcss.parse(css);
    root.walkRules((rule) => {
        let kept = 0;
        const transformer = selectorParser((selectors) => {
            selectors.each((selector) => {
                let foreign = false;
                selector.walkAttributes((attr) => {
                    const name = attr.attribute.trim();
                    const value = (attr.value ?? '').replace(/["']/g, '');
                    if (name === 'data-theme' && value !== THEME) foreign = true;
                    if (name === 'data-preset' && value !== PRESET) foreign = true;
                });
                if (foreign) {
                    selector.remove();
                    return;
                }
                selector.walkAttributes((attr) => {
                    const name = attr.attribute.trim();
                    const value = (attr.value ?? '').replace(/["']/g, '');
                    if ((name === 'data-theme' && value === THEME) || (name === 'data-preset' && value === PRESET)) attr.remove();
                });
                kept++;
            });
        });
        rule.selector = transformer.processSync(rule.selector);
        if (kept === 0 || rule.selector.trim() === '') rule.remove();
    });
    // A block left with nothing in it.
    root.walkAtRules((at) => {
        if (at.nodes && at.nodes.length === 0 && /^(media|container|supports|layer)$/.test(at.name) && at.params) at.remove();
    });
    return root.toString();
}
const safelist = JSON.parse(read('scripts/skin-css-safelist.json'));

/**
 * Only the markup of a component, without its comments. PurgeCSS matches on every word it finds, so the
 * prose in a doc comment ("the dialog", "a tooltip") would keep the rules for things this player never draws.
 */
const templateOf = (rel) => {
    const text = read(rel);
    const body = text.slice(text.indexOf('<template>'), text.lastIndexOf('</template>'));
    return body.replace(/<!--[\s\S]*?-->/g, '');
};

const content = [
    { raw: await renderControls(), extension: 'html' },
    { raw: templateOf('src/components/LuminaryPlayer.vue'), extension: 'html' },
    { raw: templateOf('src/components/ScrubThumbnail.vue'), extension: 'html' },
    // What the browser and the elements add themselves.
    { raw: `<div class="${safelist.classes.join(' ')}"></div>`, extension: 'html' },
];

const [purged] = await new PurgeCSS().purge({
    content,
    css: [{ raw: narrowToThisPlayer(skin) }],
    // Attribute selectors (`[data-open]`, `[hidden]`) carry the elements' state and are never named in markup.
    safelist: { standard: [/^data-/, ...safelist.keep.map((k) => new RegExp(k))] },
    keyframes: true,
    fontFace: true,
    variables: false,
});

const min = await transform(purged.css, { loader: 'css', minify: true });

const out = join(ROOT, 'src/generated/skin.css');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, min.code);

const kb = (n) => (n / 1024).toFixed(1);
console.log(`skin.css: ${kb(skin.length)} kB -> ${kb(min.code.length)} kB (${Math.round((min.code.length / skin.length) * 100)}%)`);
