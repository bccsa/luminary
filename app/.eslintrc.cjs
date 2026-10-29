/* eslint-env node */
require("@rushstack/eslint-patch/modern-module-resolution");

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
};
