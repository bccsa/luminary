<script setup lang="ts">
import { CheckIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import LToggle from "@/components/form/LToggle.vue";
import AuthShell from "./AuthShell.vue";
import { useAuthCopy } from "./useAuthCopy";
import { authCopy, type AuthCopyKey } from "./authCopy";

type Props = {
    clientName: string;
    logoUri?: string;
    scopes?: string[];
    busy?: boolean;
};
withDefaults(defineProps<Props>(), { scopes: () => [], busy: false });

const remember = defineModel<boolean>("remember", { default: false });
defineEmits<{ allow: []; deny: [] }>();

const c = useAuthCopy();

/**
 * A scope we have wording for is described; one we don't is shown as Hydra named
 * it. Inventing a friendly label for an unknown scope would be a guess at what
 * the user is agreeing to.
 */
const describe = (scope: string) => {
    const key = `auth.consent.scope.${scope}`;
    return key in authCopy ? c(key as AuthCopyKey) : scope;
};
</script>

<template>
    <AuthShell
        :title="c('auth.consent.title', { client: clientName })"
        :subtitle="c('auth.consent.subtitle')"
    >
        <template
            v-if="logoUri"
            #brand
        >
            <img
                :src="logoUri"
                :alt="clientName"
                class="h-10 w-10 rounded-md"
            />
        </template>

        <ul class="flex flex-col gap-2.5">
            <li
                v-for="scope in scopes"
                :key="scope"
                class="flex items-start gap-2.5"
            >
                <CheckIcon
                    class="mt-0.5 h-5 w-5 shrink-0 text-zinc-400 dark:text-slate-400"
                    aria-hidden="true"
                />
                <span class="text-sm text-zinc-700 dark:text-slate-200">{{ describe(scope) }}</span>
            </li>
        </ul>

        <label class="flex items-center gap-3 text-sm text-zinc-600 dark:text-slate-300">
            <LToggle v-model="remember" />
            {{ c("auth.consent.remember") }}
        </label>

        <div class="flex flex-col gap-2">
            <LButton
                variant="primary"
                size="xl"
                class="w-full"
                :disabled="busy"
                @click="$emit('allow')"
            >
                {{ c("auth.consent.allow") }}
            </LButton>
            <LButton
                variant="secondary"
                size="xl"
                class="w-full"
                :disabled="busy"
                @click="$emit('deny')"
            >
                {{ c("auth.consent.deny") }}
            </LButton>
        </div>
    </AuthShell>
</template>
