<script setup lang="ts">
import LInput from "../forms/LInput.vue";
import { computed, defineProps, ref, toRaw, watch } from "vue";
import LTextarea from "../forms/LTextarea.vue";
import LButton from "../button/LButton.vue";
import LBadge from "../common/LBadge.vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import ImageEditorThumbnail from "./ImageEditorThumbnail.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import { useNotificationStore } from "@/stores/notification";
import {
    db,
    type ImageUploadDto,
    type ImageDto,
    type ImageFileCollectionDto,
    maxUploadFileSize,
    DocType,
    verifyAccess,
    AclPermission,
    type Uuid,
} from "luminary-shared";
import _ from "lodash";

const { addNotification } = useNotificationStore();

type Props = {
    image: ImageDto;
    requiredGroupIds?: Uuid[];
};
const props = defineProps<Props>();

const original = db.getAsRef<ImageDto>(props.image._id);
const editable = ref<ImageDto>(_.cloneDeep(toRaw(props.image)));
const isDirty = ref(false);
const maxUploadFileSizeMb = computed(() => maxUploadFileSize.value / 1000000);
const isLocalChange = db.isLocalChangeAsRef(props.image._id);
const canEdit =
    editable.value.memberOf.length == 0 ||
    verifyAccess(editable.value.memberOf, DocType.Image, AclPermission.Edit, "all");
const canAssign = computed(() =>
    verifyAccess(editable.value.memberOf, DocType.Image, AclPermission.Assign, "any"),
);

// update editable when original changes (e.g. when the API processed the save)
watch(original, () => {
    if (!isDirty.value && !original.value.uploadData) {
        editable.value = _.cloneDeep(toRaw(original.value));
    }
});

// Dirty checking
watch(
    [original, editable],
    () => {
        isDirty.value = !_.isEqual(toRaw(original.value), editable.value);
    },
    { deep: true, immediate: true },
);

// Child component refs
const nameInput = ref<typeof LInput | undefined>(undefined);
const descriptionInput = ref<typeof LInput | undefined>(undefined);
const uploadInput = ref<typeof HTMLInputElement | undefined>(undefined);

// Methods
const save = () => {
    if (isDirty.value) {
        db.upsert<ImageDto>(toRaw(editable.value), true);
        addNotification({
            title: "Changes saved",
            state: "success",
        });
        return;
    }

    addNotification({
        title: "No changes to save",
        description: "No changes have been made to the image.",
        state: "info",
    });
};

const showFilePicker = () => {
    // @ts-ignore - it seems as if the type definition for showPicker is missing in the file input element.
    uploadInput.value!.showPicker();
};

// Read files into Buffer
const upload = () => {
    // @ts-ignore - it seems as if the type definition for files is missing in the file input element.
    if (!uploadInput.value!.files || uploadInput.value!.files.length == 0) return;

    const reader = new FileReader();
    // @ts-ignore - it seems as if the type definition for files is missing in the file input element.
    const file = uploadInput.value!.files[0];

    reader.onload = (e) => {
        if (!editable.value.uploadData) editable.value.uploadData = [] as ImageUploadDto[];
        const fileData = e.target!.result as ArrayBuffer;

        if (fileData.byteLength > maxUploadFileSize.value) {
            addNotification({
                title: `Invalid image file size`,
                description: `Image file size is larger than the maximum allowed size of ${maxUploadFileSizeMb.value}MB`,
                state: "error",
            });
            return;
        }

        editable.value.uploadData.push({
            filename: file.name,
            preset: "Original",
            fileData,
        });
    };

    reader.readAsArrayBuffer(file);

    // Reset the file input
    // @ts-ignore - it seems as if the type definition for value is missing in the file input element.
    uploadInput.value!.value = "";
};

const removeFileCollection = (collection: ImageFileCollectionDto) => {
    editable.value.fileCollections = editable.value.fileCollections
        .filter((f) => f !== collection)
        .map((f) => toRaw(f));
};

const removeFileUploadData = (uploadData: ImageUploadDto) => {
    if (!editable.value.uploadData) return;

    editable.value.uploadData = editable.value.uploadData
        .filter((f) => f !== uploadData)
        .map((f) => toRaw(f));

    if (editable.value.uploadData.length == 0) {
        delete editable.value.uploadData;
    }
};

// Data validation
const nameValidationError = computed(() => {
    if (!editable.value.name) return "Name is required";
    return "";
});

const permissionValidationError = ref("");
watch(
    editable,
    () => {
        if (
            canEdit &&
            (editable.value.memberOf.length == 0 ||
                !verifyAccess(editable.value.memberOf, DocType.Image, AclPermission.Edit, "all"))
        ) {
            permissionValidationError.value = "No group assigned";
        } else {
            permissionValidationError.value = "";
        }
    },
    { deep: true },
);

const validated = computed(() => {
    return !nameValidationError.value && !permissionValidationError.value;
});
</script>

<template>
    <div class="flex-col">
        <div class="flex items-center gap-2">
            <LBadge v-if="isLocalChange" variant="warning"> Offline changes </LBadge>
            <LBadge v-if="isDirty" variant="default"> Unsaved changes </LBadge>
            <div class="flex-1"></div>
            <LButton
                v-if="canEdit"
                variant="primary"
                :disabled="!validated"
                @click="save"
                data-test="save-button"
                >Save</LButton
            >
        </div>

        <div>
            <LInput
                ref="nameInput"
                v-model="editable.name"
                name="fileName"
                label="Image name"
                class="mb-2"
                data-test="image-name"
                :required="true"
                :state="nameValidationError ? 'error' : 'default'"
                :disabled="!canEdit"
            />

            <LTextarea
                ref="descriptionInput"
                name="description"
                label="Notes"
                v-model="editable.description"
                class="mb-2"
                data-test="image-description"
                :disabled="!canEdit"
            />

            <p class="text-xs text-red-500" v-if="permissionValidationError">
                {{ permissionValidationError }}
            </p>
            <GroupSelector
                v-model:groups="editable.memberOf"
                :disabled="!canEdit"
                :docType="DocType.Image"
                class="mb-4"
                data-test="image-group-selector"
            />

            <p class="mb-2 text-xs">
                You can upload several files in different aspect ratios. The most suitable image
                will automatically be displayed based on the aspect ratio of the image element where
                the image is displayed.
            </p>
            <p class="mb-2 text-xs">
                Uploaded images are automatically scaled for for various screen and display sizes.
            </p>
            <div class="mb-2 flex items-end gap-4" v-if="canEdit">
                <div class="flex flex-col">
                    <LButton :icon="ArrowUpOnSquareIcon" class="h-9" @click="showFilePicker"
                        >Upload</LButton
                    >
                    <input
                        ref="uploadInput"
                        type="file"
                        class="hidden"
                        accept="image/jpeg, image/png, image/webp"
                        @change="upload"
                        data-test="image-upload"
                    />
                </div>
            </div>
        </div>

        <h3
            class="mt-4 text-sm font-medium leading-6 text-zinc-900"
            v-if="editable.fileCollections.length > 0 || editable.uploadData"
        >
            Image files
        </h3>

        <div class="flex flex-1 flex-wrap gap-4 overflow-x-scroll pt-2" data-test="thumbnail-area">
            <ImageEditorThumbnail
                v-for="c in editable.fileCollections"
                :imageFileCollection="c"
                @deleteFileCollection="removeFileCollection"
                :key="c.aspectRatio"
            />
            <ImageEditorThumbnail
                v-for="u in editable.uploadData"
                :imageUploadData="u"
                @deleteUploadData="removeFileUploadData"
                :key="u.filename"
            />
        </div>
    </div>
</template>
