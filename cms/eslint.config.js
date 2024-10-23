import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import vitest from "@vitest/eslint-plugin";
import pluginVue from "eslint-plugin-vue";

export default [
    { files: ["**/*.{vue,js,mjs,cjs,ts}"] },
    {
        ignores: [
            "dist",
            ".vite",
            "node_modules",
            "*.config.js",
            "*.config.ts",
            "vitest.setup.ts",
            "**/*.spec.ts",
        ],
    },
    {
        linterOptions: { reportUnusedDisableDirectives: true },
    },
    {
        languageOptions: {
            parser: "vue-eslint-parser",
            globals: globals.browser,
            parserOptions: {
                parser: "@typescript-eslint/parser",
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: [".vue"],
            },
        },
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    ...pluginVue.configs["flat/recommended"],
    vitest.configs.recommended,
    eslintConfigPrettier,
    {
        rules: {
            "@typescript-eslint/consistent-type-definitions": ["error", "type"], // Default disallows type, this disallows interfaces
            "vue/valid-v-slot": [
                // Allow modifiers
                "error",
                {
                    allowModifiers: true,
                },
            ],
            "@typescript-eslint/no-unsafe-function-type": "warn", // Until all instances are fixed, reduce to a warning
            "no-undef": "off", // Not needed with TypeScript
            "vue/block-lang": [
                // Only allow ts
                "error",
                {
                    script: {
                        lang: "ts",
                    },
                },
            ],
            "vue/block-order": ["error", { order: ["script", "template", "style"] }], // Set fixed order for Vue SFCs
            "vue/component-api-style": "error", // Only allow composition API
            "vue/component-name-in-template-casing": "error", // Only use PascalCase component style in templates
            "vue/custom-event-name-casing": "error", // Only allow camelCase event names
            "vue/define-props-declaration": "error", // Enforce type-based declaration style of props
            "vue/match-component-file-name": "error", // Require component name property to match its file name
            "vue/match-component-import-name": "error", // Require the registered component name to match the imported component name
            "vue/no-duplicate-attr-inheritance": "error", // Enforce inheritAttrs to be set to false when using v-bind="$attrs"
        },
    },
];
