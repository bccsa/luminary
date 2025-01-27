<script setup lang="ts">
import { ref } from "vue";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/form/LModal.vue";
import LInput from "../form/LInput.vue";
import LTextarea from "../form/LTextarea.vue";
import ImageEditor from "../images/ImageEditor.vue";
import type { ImageDto } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";

const show = defineModel<boolean>("show");

type FeedbackMail = {
    name: string;
    email: string;
    image: ImageDto;
    feedback: string;
};

const form = ref<FeedbackMail>({
    name: "",
    email: "",
    image: {} as ImageDto,
    feedback: "",
});

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

    // Close the modal after submission
    show.value = false;
};
</script>

<template>
    <LModal :isVisible="show || false" heading="Contact Us">
        <form class="space-y-2">
            <!-- Explanation -->
            <div>
                <p class="text-sm text-zinc-500">
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
                />
            </div>

            <!-- Email Field -->
            <div>
                <LInput
                    v-model="form.email"
                    name="email"
                    label="Email"
                    placeholder="Enter your email"
                    required
                />
            </div>

            <!-- Feedback Field -->
            <div>
                <LTextarea
                    label="Feedback"
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
                <LButton type="submit" variant="primary" @click="handleSubmit">Submit</LButton>
            </div>
        </form>
    </LModal>
</template>
