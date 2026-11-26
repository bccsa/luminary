<script setup lang="ts">
import { computed, ref } from "vue";
import {
    AclPermission,
    DocType,
    hasAnyPermission,
    useSharedHybridQuery,
    type AuthProviderDto,
} from "luminary-shared";
import { activeProviderId } from "@/auth";
import LCard from "@/components/common/LCard.vue";
import LButton from "@/components/button/LButton.vue";
import { validDocTypes } from "@/components/groups/permissions";

const providers = useSharedHybridQuery<AuthProviderDto>(
    () => ({ selector: { type: DocType.AuthProvider } }),
    { live: true, cache: false },
);

/** The MCP URL of the provider the user is signed in with, when that provider has MCP on. */
const connectorUrl = computed(() => {
    const provider = providers.value.find((p) => p._id === activeProviderId.value);
    return provider?.mcp?.enabled ? provider.mcp.resourceUrl : undefined;
});

const hasMcpAccess = computed(() =>
    validDocTypes.some((type) => hasAnyPermission(type, AclPermission.McpView)),
);

const copied = ref(false);

async function copyUrl() {
    if (!connectorUrl.value) return;
    await navigator.clipboard.writeText(connectorUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
    <LCard
        v-if="connectorUrl"
        title="AI connector (MCP)"
        class="bg-white dark:bg-slate-800"
        data-test="ai-connector"
    >
        <template v-if="hasMcpAccess">
            <div class="mb-4 text-sm text-zinc-600 dark:text-zinc-100">
                Add Luminary to Claude, ChatGPT or another app that supports MCP connectors with
                this URL, then sign in with the same account you use here. Changes to published
                content, redirects and languages ask you to confirm before they're made.
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <code
                    class="break-all rounded bg-zinc-100 px-2 py-1 text-sm text-zinc-800 dark:bg-slate-700 dark:text-zinc-100"
                    data-test="ai-connector-url"
                    >{{ connectorUrl }}</code
                >
                <LButton @click="copyUrl" data-test="ai-connector-copy">
                    {{ copied ? "Copied" : "Copy URL" }}
                </LButton>
            </div>
        </template>
        <div
            v-else
            class="text-sm text-zinc-600 dark:text-zinc-100"
            data-test="ai-connector-no-access"
        >
            Your account has no access to the AI connector. Ask a Luminary admin to give your group
            the McpView permission.
        </div>
    </LCard>
</template>
