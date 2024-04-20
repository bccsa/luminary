<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LCard from "@/components/common/LCard.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import { useRouter } from "vue-router";
import { useGroupStore } from "@/stores/group";
import { toTypedSchema } from "@vee-validate/yup";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { ArrowRightIcon } from "@heroicons/vue/20/solid";
import { useNotificationStore } from "@/stores/notification";

const { createGroup } = useGroupStore();
const { addNotification } = useNotificationStore();
const router = useRouter();

const validationSchema = toTypedSchema(
    yup.object({
        name: yup.string().required(),
    }),
);

const { handleSubmit } = useForm({
    validationSchema,
});

const save = handleSubmit(async ({ name }) => {
    await createGroup({ name: name });

    addNotification({
        title: `Group "${name}" created`,
        description: "You can now add access lists to this group.",
        state: "success",
    });

    await router.replace({ name: "groups.index" });
});
</script>

<template>
    <BasePage title="Create group" centered>
        <div class="mx-auto max-w-xl">
            <LCard>
                <p class="text-sm text-zinc-700">
                    After creating the group it can be edited in the overview.
                </p>
                <form class="mt-6 space-y-6" @submit.prevent="save">
                    <LInput name="name" label="Name" />

                    <div class="flex justify-end">
                        <LButton type="submit" variant="primary" :icon="ArrowRightIcon" icon-right>
                            Save & continue
                        </LButton>
                    </div>
                </form>
            </LCard>
        </div>
    </BasePage>
</template>
