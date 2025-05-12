<script setup lang="ts">
import { ref } from "vue";
import { type ContentDto, DocType, db } from "luminary-shared";
import { useAuth0 } from "@auth0/auth0-vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import { isPublished } from "@/util/isPublished";
import ContinueWatching from "@/components/HomePage/ContinueWatching.vue";

const { isAuthenticated } = useAuth0();

const hasPosts = db.toRef<boolean>(
    () =>
        db.docs
            .where({
                type: DocType.Content,
                status: "published",
            })
            .filter((c) => isPublished(c as ContentDto, appLanguageIdsAsRef.value))
            .first()
            .then((c) => c != undefined),
    true,
);

const noContentMessageDelay = ref(false);
setTimeout(() => {
    noContentMessageDelay.value = true;
}, 3000);
</script>

<template>
    <BasePage>
        <div v-if="!hasPosts" class="text-zinc-800 dark:text-slate-100">
            <div v-if="isAuthenticated">
                <p>
                    You don't have access to any content. If you believe this is an error, send your
                    contact person a message.
                </p>
            </div>
        </div>
        <IgnorePagePadding ignoreTop>
            <Suspense>
                <HomePagePinned />
            </Suspense>
            <Suspense>
                <HomePageNewest />
            </Suspense>
            <ContinueWatching />
        </IgnorePagePadding>
    </BasePage>
</template>
