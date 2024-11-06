<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { db, DocType, type RedirectDto, RedirectType } from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import _ from "lodash";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import { useNotificationStore } from "@/stores/notification";

// Props for visibility and Redirect to edit
type Props = {
    isVisible: boolean;
    redirect?: RedirectDto;
};
const props = defineProps<Props>();

const emit = defineEmits(["close"]);
const isEditMode = computed(() => props.redirect != undefined);

const editable = ref<RedirectDto>({
    _id: db.uuid(), // Generate new ID for create mode
    slug: "",
    redirectType: RedirectType.Permanent,
    memberOf: [],
    type: DocType.Redirect,
    updatedTimeUtc: Date.now(),
});

// Track the previous state for dirty checking
const previous = ref<RedirectDto>();

// Watch the passed `Redirect` prop to set the modal in edit mode
watch(
    () => props.redirect,
    (redirect) => {
        if (redirect) {
            editable.value = _.cloneDeep(redirect);
            previous.value = { ...redirect }; // Save the previous state for dirty checking
        } else {
            // Reset to a new Redirect if no Redirect is passed (create mode)
            editable.value = {
                _id: db.uuid(), // Generate new ID for create mode
                slug: "",
                redirectType: RedirectType.Permanent,
                memberOf: [],
                type: DocType.Redirect,
                updatedTimeUtc: Date.now(),
            };
        }
    },
    { immediate: true },
);

const save = async () => {
    editable.value.updatedTimeUtc = Date.now();
    await db.upsert(editable.value);

    useNotificationStore().addNotification({
        title: isEditMode.value ? `Redirect updated` : `Redirect created`,
        description: `Redirecting ${editable.value.slug} to ${editable.value.toSlug ?? "HOMEPAGE"}`,
        state: "success",
    });
    emit("close");
};

const isDirty = computed(() => {
    return !_.isEqual(editable.value, previous.value);
});

const canSave = computed(() => {
    return (
        editable.value.slug?.trim() !== "" && editable.value.memberOf.length > 0 && isDirty.value
    );
});

const isTemporary = computed(() => {
    return editable.value.redirectType == RedirectType.Temporary;
});

const redirectExplanation = computed(() => {
    return isTemporary.value
        ? "Temporary redirects are used for short-term changes. They are cached by browsers and search engines for a limited time."
        : "Permanent redirects are used for long-term changes. They are cached indefinitely by browsers and search engines.";
});

const validateSlug = (slug: string | undefined) => {
    if (!slug) return undefined;
    return slug.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
};
</script>

<template>
    <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
        <div class="w-96 rounded-lg bg-white p-6 shadow-lg">
            <!-- Dynamic title based on mode -->
            <h2 class="mb-4 text-xl font-bold">
                {{ isEditMode ? "Edit redirect" : "Create new redirect" }}
            </h2>

            <div class="mb-2 flex flex-col items-center">
                <div class="mb-1 flex w-full gap-1">
                    <LButton
                        class="w-1/2"
                        :icon="isTemporary ? CheckCircleIcon : undefined"
                        @click="editable.redirectType = RedirectType.Temporary"
                        >Temporary
                    </LButton>
                    <LButton
                        class="w-1/2"
                        :icon="isTemporary ? undefined : CheckCircleIcon"
                        @click="editable.redirectType = RedirectType.Permanent"
                    >
                        Permanent
                    </LButton>
                </div>
                <p class="text-xs text-zinc-500">{{ redirectExplanation }}</p>
            </div>
            <LInput
                label="From *"
                name="RedirectFromSlug"
                v-model="editable.slug"
                class="mb-4 w-full"
                placeholder="The slug that will be redirected from.."
                @change="editable.slug = validateSlug(editable.slug)"
            />

            <LInput
                label="To"
                name="RedirectToSlug"
                v-model="editable.toSlug"
                class="mb-4 w-full"
                placeholder="The slug that will be redirected to..."
                @change="editable.toSlug = validateSlug(editable.toSlug)"
            />

            <GroupSelector
                name="memberOf"
                v-model:groups="editable.memberOf"
                :docType="DocType.Redirect"
            />
            <div class="flex justify-end gap-4 pt-5">
                <LButton variant="secondary" data-test="cancel" @click="emit('close')"
                    >Cancel</LButton
                >
                <LButton
                    variant="primary"
                    data-test="save-button"
                    @click="save"
                    :disabled="!canSave"
                >
                    {{ isEditMode ? "Save" : "Create" }}
                </LButton>
            </div>
        </div>
    </div>
</template>
