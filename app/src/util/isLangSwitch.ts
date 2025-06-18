import { ref, watch } from "vue";

/**
 * Reactive ref for the language switch flag.
 */
export const isLanguageSwitchRef = ref(localStorage.getItem("isLanguageSwitch") === "true");

/**
 * Watch for changes and sync with localStorage.
 */
watch(isLanguageSwitchRef, (val) => {
    localStorage.setItem("isLanguageSwitch", val ? "true" : "false");
});

/**
 * Gets the language switch flag as a boolean (reactive).
 */
export const getLanguageSwitchFlag = (): boolean => {
    return isLanguageSwitchRef.value;
};

/**
 * Marks the language switch flag to true (reactive).
 */
export const markLanguageSwitch = () => {
    isLanguageSwitchRef.value = true;
};

/**
 * Consumes the language switch flag and resets it to false (reactive).
 * @returns - The value of the language switch flag.
 */
export const consumeLanguageSwitchFlag = (): boolean => {
    const value = isLanguageSwitchRef.value;
    isLanguageSwitchRef.value = false;
    return value;
};
