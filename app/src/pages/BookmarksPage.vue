<script lang="ts" setup>
import ContentTile from "@/components/content/ContentTile.vue";
import { appLanguageIdAsRef, userPreferences } from "@/globalConfig";
import { db } from "luminary-shared";

const bookmarkKeys = Object.keys(userPreferences.value.bookmarks);
const bookmarkContent = db.whereParentAsRef(bookmarkKeys, undefined, appLanguageIdAsRef.value);
</script>

<template>
    <div>
        <h1>Bookmarks Page</h1>
        <ContentTile v-for="content in bookmarkContent" :key="content._id" :content="content" />
    </div>
</template>
