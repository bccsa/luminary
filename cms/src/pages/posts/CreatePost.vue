<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import AcButton from "@/components/button/AcButton.vue";
import AcBadge from "@/components/common/AcBadge.vue";
import AcCard from "@/components/common/AcCard.vue";
import AcInput from "@/components/forms/AcInput.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import { useLanguageStore } from "@/stores/language";
import { CreatePostDto, type Language } from "@/types";
import { ref } from "vue";
import { ArrowRightIcon } from "@heroicons/vue/20/solid";
import { usePostStore } from "@/stores/post";
import { useRouter } from "vue-router";
import { useValidation } from "@/composables/validation";

const languageStore = useLanguageStore();
const postStore = usePostStore();
const router = useRouter();

const image = ref<string>("");
const title = ref<string>("");
const chosenLanguage = ref<Language>();

const { validate, hasValidationError, fieldError } = useValidation();

function chooseLanguage(language: Language) {
    chosenLanguage.value = language;
}
function resetLanguage() {
    chosenLanguage.value = undefined;
    title.value = "";
}

async function save() {
    const post = new CreatePostDto(image.value, chosenLanguage.value!, title.value);

    await validate(post);

    if (hasValidationError) {
        return;
    }

    await postStore.createPost(post);

    // TODO route to edit page
    router.push({ name: "posts" });
}
</script>

<template>
    <BasePage title="Create post" centered>
        <div class="mx-auto max-w-xl">
            <AcCard>
                <div class="space-y-6">
                    <p class="text-sm text-gray-700">
                        These are all the required fields for creating a post. After clicking
                        'continue' the post will be saved as a draft and you can continue editing.
                    </p>

                    <AcInput
                        v-model="image"
                        label="Default image"
                        placeholder="cdn.bcc.africa/img/image.png"
                        leftAddOn="https://"
                        required
                        :state="fieldError('image') ? 'error' : 'default'"
                    >
                        {{ fieldError("image") }}
                    </AcInput>

                    <AcInput label="Permissions" placeholder="Not implemented yet" disabled />

                    <transition
                        enter-active-class="transition ease-out duration-150"
                        enter-from-class="transform opacity-0 -translate-y-2"
                        enter-to-class="transform opacity-100 translate-y-0"
                        leave-active-class="hidden"
                    >
                        <div class="space-y-2" v-if="!chosenLanguage">
                            <FormLabel>Select language for first translation</FormLabel>
                            <div class="rounded-lg border-2 border-gray-100">
                                <button
                                    v-for="language in languageStore.languages"
                                    :key="language.languageCode"
                                    class="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm text-gray-950 hover:bg-gray-50 active:bg-gray-100"
                                    @click="chooseLanguage(language)"
                                >
                                    <div class="flex items-center gap-2">
                                        <AcBadge type="language" no-icon>
                                            {{ language.languageCode }}
                                        </AcBadge>
                                        {{ language.name }}
                                    </div>
                                    <div
                                        class="hidden text-xs text-gray-600 sm:group-hover:block sm:group-active:block"
                                    >
                                        Select
                                    </div>
                                </button>
                            </div>
                        </div>
                    </transition>

                    <transition
                        enter-active-class="transition ease-out duration-150"
                        enter-from-class="transform opacity-0 translate-y-2"
                        enter-to-class="transform opacity-100 translate-y-0"
                        leave-active-class="hidden"
                    >
                        <div v-if="chosenLanguage" class="space-y-6">
                            <AcInput
                                v-model="title"
                                label="Title"
                                :placeholder="chosenLanguage.name"
                                required
                                :state="fieldError('title') ? 'error' : 'default'"
                            >
                                {{ fieldError("title") }}
                            </AcInput>

                            <div class="flex flex-col gap-4 sm:flex-row sm:justify-between">
                                <button
                                    class="text-xs text-gray-600 hover:text-gray-800"
                                    @click="resetLanguage"
                                >
                                    Select different language
                                </button>
                                <AcButton
                                    variant="primary"
                                    :icon="ArrowRightIcon"
                                    icon-right
                                    @click="save"
                                >
                                    Save as draft & continue
                                </AcButton>
                            </div>
                        </div>
                    </transition>
                </div>
            </AcCard>
        </div>
    </BasePage>
</template>
