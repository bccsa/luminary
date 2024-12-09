<script setup lang="ts">
import { ref } from "vue";
import { type ContentDto, DocType, db } from "luminary-shared";
import { useAuth0 } from "@auth0/auth0-vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageUnpinned from "@/components/HomePage/HomePageUnpinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";

const { isAuthenticated } = useAuth0();

const hasPosts = db.toRef<boolean>(
    () =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageIdAsRef.value,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
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
    <div v-if="!hasPosts" class="text-zinc-800 dark:text-slate-100">
        <div v-if="isAuthenticated">
            <p>
                You don't have access to any content. If you believe this is an error, send your
                contact person a message.
            </p>
        </div>
        <div v-else>
            <div v-if="noContentMessageDelay">
                <p>There is currently no content available.</p>

                <p class="mt-1">
                    Please
                    <router-link
                        :to="{ name: 'login' }"
                        class="text-yellow-600 underline hover:text-yellow-500"
                        >log in </router-link
                    >if you have an account.
                </p>
            </div>
        </div>
    </div>
    <IgnorePagePadding v-else class="mb-4">
        <Suspense>
            <HomePageNewest />
        </Suspense>
        <Suspense>
            <HomePagePinned />
        </Suspense>
        <Suspense>
            <HomePageUnpinned />
        </Suspense>
    </IgnorePagePadding>
</template>
