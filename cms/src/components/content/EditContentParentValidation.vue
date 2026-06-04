<script setup lang="ts">
import EditContentValidation from "./EditContentValidation.vue";
import {
    type ContentDto,
    type Uuid,
    type LanguageDto,
    type ContentParentDto,
    TagType,
    PostType,
} from "luminary-shared";
import { computed, nextTick, ref, watch, watchEffect, onMounted, onUnmounted } from "vue";
import { validate, type Validation } from "./ContentValidator";
import LanguageSelector from "./LanguageSelector.vue";
import {
    ExclamationCircleIcon,
    LanguageIcon,
    PlusIcon,
    XCircleIcon,
} from "@heroicons/vue/20/solid";
import LCard from "../common/LCard.vue";
import LButton from "../button/LButton.vue";
import { useRouter } from "vue-router";
import { isSmallScreen } from "@/globalConfig";
import LDropdown from "../common/LDropdown.vue";

type Props = {
    languages: LanguageDto[];
    dirty: boolean;
    existingParent: ContentParentDto | undefined;
    existingContent: ContentDto[] | undefined;
    canEdit: boolean;
    canTranslate: boolean;
    canPublish: boolean;
    untranslatedLanguages: LanguageDto[];
    tagOrPostType: TagType | PostType;
    canDelete: boolean;
};
const props = defineProps<Props>();
const editableParent = defineModel<ContentParentDto>("editableParent");
const editableContent = defineModel<ContentDto[]>("editableContent");

// Overall validation checking
const overallValidations = ref([] as Validation[]);
const overallIsValid = ref(true);

const showLanguageSelector = ref(false);
const isLanguageSelectorCollapsed = ref(false);
const languageSelector = ref<HTMLElement>();
// When the user manually expands the card while it's still inside the sticky
// collision zone, pause auto-collapse so their click actually takes effect.
// Reset once they scroll far enough away from the topbar.
let userExpandOverride = false;

// Check if card is close to topbar
const checkTopbarCollision = () => {
    if (!languageSelector.value) return;

    // Only run on small screens or when testing
    if (!isSmallScreen.value && import.meta.env.MODE !== "test") return;

    const topbar = document.querySelector("[data-topbar]") as HTMLElement;
    if (!topbar) return;

    const topbarBottom = topbar.getBoundingClientRect().bottom;
    const cardTop = languageSelector.value.getBoundingClientRect().top;
    const distance = cardTop - topbarBottom;

    if (userExpandOverride) {
        // Only re-arm auto-collapse once the user has scrolled clear of the sticky zone.
        if (distance > 60) userExpandOverride = false;
        return;
    }

    // Hysteresis: collapse when close to topbar, uncollapse when sufficiently away
    // This prevents jitter from layout reflow triggering rapid collapse/uncollapse
    if (!isLanguageSelectorCollapsed.value && distance <= 25) {
        isLanguageSelectorCollapsed.value = true;
    } else if (isLanguageSelectorCollapsed.value && distance > 60) {
        isLanguageSelectorCollapsed.value = false;
    }
};

onMounted(() => {
    // Run on small screens or when testing
    if (!isSmallScreen.value && import.meta.env.MODE !== "test") return;

    // Listen during capture phase so it fires even when scroll propagation is stopped
    document.addEventListener("scroll", checkTopbarCollision, { passive: true, capture: true });

    // Track selector size changes (e.g., unsaved-changes warnings appearing/disappearing)
    if (languageSelector.value && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => emitSelectorHeight());
        resizeObserver.observe(languageSelector.value);
    }

    // Initial check
    setTimeout(() => {
        checkTopbarCollision();
        emitSelectorHeight();
    }, 100);
});

onUnmounted(() => {
    document.removeEventListener("scroll", checkTopbarCollision, {
        capture: true,
    } as EventListenerOptions);
    resizeObserver?.disconnect();
});

const router = useRouter();
const selectedLanguage = computed(() => {
    return props.languages.find(
        (l) => l.languageCode == router.currentRoute.value.params.languageCode,
    );
});

const lang = computed(() => {
    return isLanguageSelectorCollapsed.value
        ? props.languages?.filter((l) => l._id == selectedLanguage.value?._id)
        : props.languages;
});

const setOverallValidation = (id: Uuid, isValid: boolean) => {
    let validation = overallValidations.value.find((v) => v.id == id);
    if (!validation) {
        validation = { id, isValid, message: "" };
        overallValidations.value.push(validation);
    } else {
        validation.isValid = isValid;
    }
    overallIsValid.value = overallValidations.value.every((v) => v.isValid);
};

const emit = defineEmits<{
    (e: "updateIsValid", value: boolean): void;
    (e: "createTranslation", language: LanguageDto): void;
    (e: "update:selectorCollapsed", value: boolean): void;
    (e: "update:selectorHeight", value: number): void;
}>();

let resizeObserver: ResizeObserver | undefined;

const emitSelectorHeight = () => {
    const height = languageSelector.value?.getBoundingClientRect().height ?? 0;
    emit("update:selectorHeight", height);
};

watch(
    isLanguageSelectorCollapsed,
    async (val, prevVal) => {
        emit("update:selectorCollapsed", val);

        // User just expanded the card manually. If it's still in the sticky
        // collision zone, suppress auto-collapse until they scroll away.
        if (prevVal === true && val === false) {
            const topbar = document.querySelector("[data-topbar]") as HTMLElement | null;
            if (topbar && languageSelector.value) {
                const distance =
                    languageSelector.value.getBoundingClientRect().top -
                    topbar.getBoundingClientRect().bottom;
                if (distance <= 60) userExpandOverride = true;
            }
        } else if (val) {
            userExpandOverride = false;
        }

        await nextTick();
        emitSelectorHeight();
    },
    // Sync so the override is set before any scroll event that may fire from
    // layout shift or touch-scroll momentum after the chevron tap.
    { flush: "sync" },
);

// Preempt auto-collapse on any tap that originates inside the card header/chevron,
// so a touch tap that fires alongside a momentum-scroll event can't lose the race.
const onSelectorPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // Only arm the override when the tap is on the collapse chevron — taps that
    // land elsewhere (e.g. starting a touch-scroll) shouldn't suppress auto-collapse.
    if (target.closest('[data-test="collapse-button"]')) {
        userExpandOverride = true;
    }
};

watchEffect(() => {
    emit("updateIsValid", overallIsValid.value);
});

// Parent validation
const parentValidations = ref([] as Validation[]);
const parentIsValid = ref(true);
watch(
    [editableParent, editableContent],
    ([_editableParent, _editableContent]) => {
        if (!_editableParent) return;

        validate(
            "At least one translation is required",
            "translations",
            parentValidations.value,
            _editableParent,
            () =>
                _editableContent != undefined &&
                _editableContent.filter((c) => !c.deleteReq).length > 0,
        );

        parentIsValid.value = parentValidations.value.every((v) => v.isValid);

        // Update overall validation
        let parentOverallValidation = overallValidations.value.find(
            (v) => v.id == _editableParent._id,
        );
        if (!parentOverallValidation) {
            parentOverallValidation = {
                id: _editableParent._id,
                isValid: parentIsValid.value,
                message: "",
            };
            overallValidations.value.push(parentOverallValidation);
        } else {
            parentOverallValidation.isValid = parentIsValid.value;
        }
        overallIsValid.value = overallValidations.value.every((v) => v.isValid);
    },
    { immediate: true, deep: true },
);
</script>

<template>
    <div ref="languageSelector" @pointerdown="onSelectorPointerDown">
        <LCard
            :class="[
                'bg-white',
                // In the sticky/collapsed state, drop the 2px y-borders and the
                // card shadow so adjacent cards don't stack visible dividers.
                isLanguageSelectorCollapsed && '!shadow-none',
            ]"
            shadow="small"
            title="Translations"
            :icon="LanguageIcon"
            :collapsible="props.languages.length > 1"
            v-model:collapsed="isLanguageSelectorCollapsed"
        >
            <template #actions>
                <div class="relative flex flex-col items-end gap-2">
                    <LDropdown v-model:show="showLanguageSelector" placement="top-end">
                        <template #trigger>
                            <LButton
                                :icon="PlusIcon"
                                class="w-fit"
                                variant="muted"
                                data-test="add-translation-button"
                                aria-label="Add translation"
                            />
                        </template>
                        <div v-if="untranslatedLanguages.length > 0">
                            <LanguageSelector
                                :languages="untranslatedLanguages"
                                :parent="editableParent"
                                :content="editableContent"
                                :show-selector="showLanguageSelector"
                                @create-translation="
                                    (language) => {
                                        emit('createTranslation', language);
                                        showLanguageSelector = false;
                                    }
                                "
                            />
                        </div>
                        <span v-else class="p-2 text-sm">All languages have translations</span>
                    </LDropdown>
                </div>
            </template>

            <template #persistent>
                <div class="flex flex-col gap-1" :class="{ 'mb-3': isLanguageSelectorCollapsed }">
                    <EditContentValidation
                        v-for="content in editableContent?.filter((c) => !c.deleteReq)"
                        :editableContent="content"
                        :languages="lang"
                        :key="content._id"
                        @isValid="(val) => setOverallValidation(content._id, val)"
                        :existingContent="existingContent?.find((c) => c._id == content._id)"
                        :can-delete="canDelete"
                        :isCardCollapsed="isLanguageSelectorCollapsed"
                    />
                </div>
            </template>

            <div class="flex flex-col">
                <div
                    v-if="!(canTranslate || canPublish) || !canEdit"
                    class="mb-1 rounded-md bg-zinc-50 p-2 shadow"
                >
                    <span v-if="!canTranslate" class="mb-1 flex gap-1 text-xs text-zinc-600">
                        <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />No
                        translate permission</span
                    >
                    <span v-if="!canPublish" class="mb-1 flex gap-1 text-xs text-zinc-600">
                        <ExclamationCircleIcon class="h-4 w-4 text-red-400" />No publish
                        permission</span
                    >
                    <span v-if="!canEdit" class="flex gap-1 text-xs text-zinc-600">
                        <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />No
                        edit permission</span
                    >
                </div>
                <div v-if="!parentIsValid">
                    <div class="my-1 flex flex-col gap-0.5">
                        <div
                            v-for="validation in parentValidations.filter((v) => !v.isValid)"
                            :key="validation.id"
                            class="-mb-[1px] flex items-center gap-1"
                        >
                            <div class="flex items-center gap-2">
                                <XCircleIcon class="h-[18px] w-[18px] min-w-[18px] text-red-400" />
                                <span class="text-xs text-zinc-700">{{ validation.message }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </LCard>
    </div>
</template>
