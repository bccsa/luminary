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
        },
    },
];
