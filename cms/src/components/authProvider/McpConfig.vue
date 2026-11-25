<script setup lang="ts">
import type { AuthProviderDto } from "luminary-shared";
import { computed } from "vue";
import { apiUrl } from "@/globalConfig";
import LInput from "../forms/LInput.vue";
import LToggle from "../forms/LToggle.vue";

defineProps<{
    disabled?: boolean;
}>();

const provider = defineModel<AuthProviderDto | undefined>("provider");

/** This provider's MCP URL on this API, in the canonical form the API requires. */
const suggestedResourceUrl = computed(() => {
    if (!provider.value?._id || !apiUrl) return "";
    try {
        return new URL(`${String(apiUrl).replace(/\/+$/, "")}/mcp/${provider.value._id}`).href;
    } catch {
        return "";
    }
});

const enabled = computed(() => provider.value?.mcp?.enabled === true);

// The mcp object is only created once the user switches MCP on, so opening the modal doesn't
// mark the provider as edited.
function setEnabled(value: boolean) {
    if (!provider.value) return;
    if (!provider.value.mcp) {
        if (!value) return;
        provider.value.mcp = {
            enabled: true,
            resourceUrl: suggestedResourceUrl.value,
            cmsUrl: window.location.origin,
        };
        return;
    }
    provider.value.mcp.enabled = value;
}

function setUrl(key: "resourceUrl" | "cmsUrl", value: string) {
    if (!provider.value?.mcp) return;
    provider.value.mcp[key] = value.trim() || undefined;
}

const clientIds = computed(() => (provider.value?.mcp?.allowedClientIds ?? []).join(", "));

function setClientIds(value: string) {
    if (!provider.value?.mcp) return;
    const ids = value.split(/[\s,]+/).filter(Boolean);
    provider.value.mcp.allowedClientIds = ids.length ? ids : undefined;
}
</script>

<template>
    <div
        class="rounded-md border border-zinc-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
        data-test="mcp-config"
    >
        <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-medium text-zinc-900 dark:text-zinc-100">AI connector (MCP)</h3>
            <LToggle
                :model-value="enabled"
                :disabled="disabled || !provider"
                data-test="mcp-enabled"
                @update:model-value="setEnabled"
            />
        </div>
        <p class="text-[11px] text-zinc-500 dark:text-zinc-200">
            Lets users with the McpView permission work with Luminary from AI apps such as Claude or
            ChatGPT, signing in with this provider.
        </p>

        <div v-if="provider?.mcp" class="mt-2 space-y-2">
            <div>
                <label
                    for="mcp-resourceUrl"
                    class="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-100"
                    >MCP URL</label
                >
                <LInput
                    id="mcp-resourceUrl"
                    name="mcp-resourceUrl"
                    :model-value="provider.mcp.resourceUrl ?? ''"
                    type="text"
                    :placeholder="suggestedResourceUrl"
                    :disabled="disabled"
                    @update:model-value="(v) => setUrl('resourceUrl', v)"
                />
                <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Create a separate API in your identity provider with exactly this URL as its
                    identifier (audience). It must differ from the audience above.
                </p>
            </div>

            <div>
                <label
                    for="mcp-cmsUrl"
                    class="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-100"
                    >CMS URL</label
                >
                <LInput
                    id="mcp-cmsUrl"
                    name="mcp-cmsUrl"
                    :model-value="provider.mcp.cmsUrl ?? ''"
                    type="text"
                    placeholder="https://cms.example.com"
                    :disabled="disabled"
                    @update:model-value="(v) => setUrl('cmsUrl', v)"
                />
                <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Used for links back to the CMS in AI answers.
                </p>
            </div>

            <div>
                <label
                    for="mcp-clientIds"
                    class="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-100"
                    >Allowed client IDs</label
                >
                <LInput
                    id="mcp-clientIds"
                    name="mcp-clientIds"
                    :model-value="clientIds"
                    type="text"
                    placeholder="Any client"
                    :disabled="disabled"
                    @update:model-value="setClientIds"
                />
                <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Optional, comma-separated. Only for AI apps you registered in your identity
                    provider yourself; leave empty when apps register themselves.
                </p>
            </div>
        </div>
    </div>
</template>
