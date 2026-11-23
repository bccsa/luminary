/* eslint-env node */
require("@rushstack/eslint-patch/modern-module-resolution");

const DOWNLOADS_MESSAGE =
    "Downloads code is reached only through provideDownloads, which only a build target's own entry imports; use DownloadsKey and the downloads contract.";
// The same paths as the import patterns below, for import() expressions. The selector parser ends a regex at its
// first slash, so slashes are written as \x2F.
const DOWNLOADS_SPECIFIER =
    "/^(?!.*contracts\\x2Fdownloads\\x2F)(?!.*build-time\\x2Fplugins\\x2Fdownloads\\x2Findex(\\.ts)?$)(@\\x2Fdownloads(\\x2F|$)|.*\\x2Fdownloads\\x2F)/";
// The in-app entry's one import: the fake engine, on the development server only. A build replaces
// import.meta.env.DEV with false, which makes `DEV && …` false and drops that branch with its import; only the
// consequent of such a test is dropped, so an else branch or a `DEV || …` test does not qualify.
const DEV_GUARDED_PROVIDE =
    'IfStatement[test.type="LogicalExpression"][test.operator="&&"][test.left.type="MemberExpression"][test.left.property.name="DEV"][test.left.object.property.name="env"][test.left.object.object.type="MetaProperty"] > .consequent ImportExpression[source.value="./provide"]';

module.exports = {
    root: true,
    extends: [
        "plugin:vue/vue3-essential",
        "eslint:recommended",
        "@vue/eslint-config-typescript",
        "@vue/eslint-config-prettier/skip-formatting",
    ],
    parserOptions: {
        ecmaVersion: "latest",
    },
    rules: {
        // Video.js 10's controls are custom elements, filled from static markup (media-player/player).
        "vue/no-v-text-v-html-on-component": ["error", { allow: ["media-controls"] }],
    },
    overrides: [
        {
            // Only a build target with a downloads engine reaches the downloads code, through provide.ts, so
            // neither web bundle can contain it. Consumers use the contract and DownloadsKey instead.
            files: ["src/**/*.{ts,tsx,vue,js,mjs,cjs}"],
            excludedFiles: ["src/downloads/**", "src/build-time/plugins/downloads/provide.ts"],
            rules: {
                "no-restricted-imports": [
                    "error",
                    {
                        patterns: [
                            {
                                group: [
                                    "@/downloads",
                                    "@/downloads/**",
                                    "**/downloads/**",
                                    "!**/contracts/downloads/**",
                                    "!**/build-time/plugins/downloads/index",
                                    "!**/build-time/plugins/downloads/index.ts",
                                ],
                                message: DOWNLOADS_MESSAGE,
                            },
                        ],
                    },
                ],
                "no-restricted-syntax": [
                    "error",
                    {
                        // A lazy import makes a chunk of its own, which a web bundle would still carry.
                        selector: `ImportExpression[source.value=${DOWNLOADS_SPECIFIER}]`,
                        message: DOWNLOADS_MESSAGE,
                    },
                    {
                        selector: `ImportExpression[source.type="TemplateLiteral"][source.quasis.0.value.cooked=${DOWNLOADS_SPECIFIER}]`,
                        message: DOWNLOADS_MESSAGE,
                    },
                ],
            },
        },
        {
            // Every build without its own downloads entry resolves `virtual:downloads` here, so it reaches nothing
            // outside the development server.
            files: ["src/build-time/plugins/downloads/index.ts"],
            rules: {
                "no-restricted-imports": [
                    "error",
                    {
                        patterns: [
                            {
                                group: [
                                    "./*",
                                    "@/downloads/**",
                                    "**/downloads/**",
                                    "!**/contracts/downloads/**",
                                ],
                                message: DOWNLOADS_MESSAGE,
                            },
                        ],
                    },
                ],
                "no-restricted-syntax": [
                    "error",
                    {
                        selector: `ImportExpression:not(${DEV_GUARDED_PROVIDE})`,
                        message: DOWNLOADS_MESSAGE,
                    },
                ],
            },
        },
    ],
};
