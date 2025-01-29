<script setup lang="ts">
import { computed, ref } from "vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "../form/LInput.vue";
import LTextarea from "../form/LTextarea.vue";
import ImageEditor from "../images/ImageEditor.vue";
import type { ImageDto } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import type { Option } from "../form/LSelect.vue";
import LSelect from "../form/LSelect.vue";
import FormLabel from "../form/FormLabel.vue";
import { useAuth0 } from "@auth0/auth0-vue";

type FeedbackMail = {
    name: string;
    email: string;
    reasonOption: string;
    image: ImageDto;
    feedback: string;
};

// set the name and the email if the user if logged in
const { user, isAuthenticated } = useAuth0();

const form = ref<FeedbackMail>({
    name: isAuthenticated.value ? (user.value?.name ?? "") : "",
    email: isAuthenticated.value ? (user.value?.email ?? "") : "",
    reasonOption: "",
    image: {} as ImageDto,
    feedback: "",
});

// Email validation
const emailError = ref<string | null>(null);
const isEmailValid = computed(() => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(form.value.email);
});

const validateEmail = () => {
    if (!form.value.email) {
        emailError.value = "Email is required.";
    } else if (!isEmailValid.value) {
        emailError.value = "Please enter a valid email address.";
    } else {
        emailError.value = null;
    }
};

const reasonOptions: Option[] = [
    {
        value: "bug-report",
        label: "Bug Report",
    },
    {
        value: "feature-request",
        label: "Feature Request",
    },
    {
        value: "other",
        label: "Other",
    },
];

// Handle form submission
const handleSubmit = (e: Event) => {
    e.preventDefault();

    const { name, email, image, feedback } = form.value;

    // Create the mailto link
    const subject = encodeURIComponent("User Feedback");
    const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nImage: ${image}\nFeedback: ${feedback}`,
    );

    const mailtoLink = `mailto:support@example.com?subject=${subject}&body=${body}`;

    // Open the email client
    window.location.href = mailtoLink;

    useNotificationStore().addNotification({
        title: "Thanks for your feedback!",
        description: "We will get back to you as soon as possible.",
        state: "success",
        type: "toast",
    });
};
</script>

<template>
    <div class="space-y-4 px-64">
        <form class="space-y-3">
            <!-- Explanation -->
            <div class="mb-5">
                <h1 class="mb-1 text-3xl font-semibold text-zinc-900 dark:text-slate-100">
                    Contact us
                </h1>
                <p class="text-sm text-zinc-500 dark:text-slate-100">
                    Please fill out the form below to submit a user feedback or to make a request to
                    the support team.
                </p>
            </div>
            <!-- Name Field -->
            <div>
                <LInput
                    v-model="form.name"
                    name="name"
                    label="Name"
                    placeholder="Enter your name"
                    :disabled="isAuthenticated"
                />
            </div>

            <!-- Email Field -->
            <div>
                <LInput
                    v-model="form.email"
                    name="email"
                    label="Email"
                    placeholder="Enter your email"
                    :disabled="isAuthenticated"
                    @blur="validateEmail"
                    required
                />
                <p v-if="emailError" class="mt-1 text-sm text-red-500">{{ emailError }}</p>
            </div>

            <div v-if="form.email">
                <FormLabel class="mb-0.5 block text-sm font-medium leading-6 text-zinc-900"
                    >Reason</FormLabel
                >
                <LSelect
                    v-model="form.reasonOption"
                    :options="reasonOptions"
                    required
                    class="py-1.5"
                />
            </div>

            <!-- Feedback Field -->
            <div>
                <LTextarea
                    label="Message"
                    v-model="form.feedback"
                    placeholder="Share your feedback..."
                    rows="4"
                    required
                />
            </div>

            <!-- Image Field -->
            <div>
                <ImageEditor v-model:imageData="form.image" :disabled="false" />
            </div>

            <!-- Submit Button -->
            <div class="flex justify-end">
                <LButton type="submit" variant="primary" @click="handleSubmit">Send</LButton>
            </div>
        </form>
    </div>
</template>
