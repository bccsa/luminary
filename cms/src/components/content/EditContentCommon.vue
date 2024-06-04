<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LCard from "@/components/common/LCard.vue";
import {
    Cog6ToothIcon,
    DocumentTextIcon,
    VideoCameraIcon,
    MusicalNoteIcon,
    LinkIcon,
    EyeIcon,
    ArrowTopRightOnSquareIcon,
} from "@heroicons/vue/20/solid";
import {
    ExclamationCircleIcon,
    PencilIcon,
    XCircleIcon,
    ChevronLeftIcon,
} from "@heroicons/vue/16/solid";
import {
    ContentStatus,
    type Content,
    type Post,
    type Tag,
    TagType,
    DocType,
    AclPermission,
    type PostDto,
    type TagDto,
    type LanguageDto,
} from "@/types";
import { toTypedSchema } from "@vee-validate/yup";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { computed, nextTick, onBeforeMount, ref, toRaw } from "vue";
import { onlyAllowedKeys } from "@/util/onlyAllowedKeys";
import { DateTime } from "luxon";
import { renderErrorMessage } from "@/util/renderErrorMessage";
import { useLocalChangeStore } from "@/stores/localChanges";
import { storeToRefs } from "pinia";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { Slug } from "@/util/slug";
import TagSelector2 from "./TagSelector2.vue";
import { useTagStore } from "@/stores/tag";
import { capitaliseFirstLetter } from "@/util/string";
import RichTextEditor from "@/components/editor/RichTextEditor.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import LToggle from "@/components/forms/LToggle.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import { useNotificationStore } from "@/stores/notification";
import { useUserAccessStore } from "@/stores/userAccess";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { db } from "@/db/baseDatabase";

const { verifyAccess } = useUserAccessStore();

type Props = {
    docType: DocType;
    language?: LanguageDto;
};
const props = defineProps<Props>();
const parent = defineModel<PostDto | TagDto>();

const canEdit = computed(() => {
    if (parent && parent.value) {
        return verifyAccess(parent.value.memberOf, props.docType, AclPermission.Edit);
    }

    return false;
});
</script>

<template>
    <LCard
        :title="`${capitaliseFirstLetter(docType.toString())} settings`"
        :icon="Cog6ToothIcon"
        class="sticky top-20"
        collapsible
    >
        <div v-if="docType == DocType.Tag" class="mb-6 flex items-center justify-between">
            <FormLabel>Pinned</FormLabel>
            <!-- @vue-expect-error We are checking the DocType above, so pinned should only be called on Tag documents -->
            <LToggle v-model="parent!.pinned" :disabled="!canEdit" />
        </div>

        <LInput
            name="parent.image"
            label="Default image"
            :icon="LinkIcon"
            placeholder="https://..."
            :disabled="!canEdit"
        >
            This image can be overridden in a translation
        </LInput>

        <TagSelector2
            v-model="parent"
            :docType="docType"
            :language="language"
            :tagType="TagType.Category"
            label="Categories"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />

        <TagSelector2
            v-model="parent"
            :docType="docType"
            :language="language"
            :tagType="TagType.Topic"
            label="Topics"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />

        <TagSelector2
            v-model="parent"
            :docType="docType"
            :language="language"
            :tagType="TagType.AudioPlaylist"
            label="Audio Playlists"
            class="mt-6"
            :disabled="!canEdit"
            :key="language?._id"
        />
    </LCard>
</template>
