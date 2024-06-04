<script setup lang="ts">
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { useUserAccessStore } from "@/stores/userAccess";
import type { ContentDto, DocType, PostDto, TagDto } from "@/types";
import { storeToRefs } from "pinia";

type Props = {
    content: ContentDto;
    parent: PostDto | TagDto;
    docType: DocType;
};
const props = defineProps<Props>();

const EMPTY_TEXT = '{"type":"doc","content":[{"type":"paragraph"}]}';

const { isConnected } = storeToRefs(useSocketConnectionStore());
const { verifyAccess } = useUserAccessStore();
const { clientAppUrl } = useGlobalConfigStore();
</script>

<template>
    <div></div>
</template>
