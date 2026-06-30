<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserDisplayCard from "@/components/users/UserDisplayCard.vue";
import CreateOrEditUser from "@/components/users/CreateOrEditUser.vue";
import UserFilterOptions, {
    type UserOverviewQueryOptions,
} from "@/components/users/UserFilterOptions.vue";
import { PlusIcon, ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    type UserDto,
    useSharedHybridQuery,
    useHybridQueryWithState,
    type GroupDto,
    isConnected,
    useServerFtsSearch,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import LButton from "../button/LButton.vue";
import LoadingBar from "../LoadingBar.vue";
import FtsStaleResultsBanner from "@/components/common/FtsStaleResultsBanner.vue";
import { isSmallScreen } from "@/globalConfig";
import {
    useInfiniteScrollList,
    useInfiniteScrollLoadMore,
} from "@/composables/useInfiniteScrollList";

const canCreateNew = computed(() => hasAnyPermission(DocType.User, AclPermission.Edit));

// User is a non-synced type → HybridQuery serves it API-only (REST + on-demand socket rooms).
// Auto-disposes on unmount.
const {
    output: users,
    isFetching,
    hasLocalChanges,
} = useHybridQueryWithState<UserDto>(() => ({ selector: { type: DocType.User } }), { live: true });

const isEditUserModalVisible = ref(false);
const isNewUserModalVisible = ref(false);
const selectedUserId = ref<string>("");
/** Stable id for the create modal — must not call db.uuid() in the template (re-renders would re-query forever). */
const newUserId = ref("");

function openCreateUserModal() {
    newUserId.value = db.uuid();
    isNewUserModalVisible.value = true;
}

const defaultQueryOptions: UserOverviewQueryOptions = {
    groups: [],
    search: "",
};
const savedQueryOptions = () => sessionStorage.getItem("userOverviewQueryOptions");
function mergeNewFields(saved: string | null): UserOverviewQueryOptions {
    const parsed = saved ? JSON.parse(saved) : {};
    return {
        ...defaultQueryOptions,
        ...parsed,
        groups: parsed.groups ?? [],
    };
}
const queryOptions = ref<UserOverviewQueryOptions>(
    mergeNewFields(savedQueryOptions()) as UserOverviewQueryOptions,
);
watch(
    queryOptions,
    () => {
        sessionStorage.setItem("userOverviewQueryOptions", JSON.stringify(queryOptions.value));
    },
    { deep: true },
);

const groups = useSharedHybridQuery<GroupDto>(() => ({ selector: { type: DocType.Group } }), {
    live: true,
});

/** Minimum characters before switching from in-memory browse to server-side FTS search. */
const SEARCH_MIN_CHARS = 3;
const searchActive = computed(
    () => (queryOptions.value.search ?? "").trim().length >= SEARCH_MIN_CHARS,
);

// --- Browse (no / short search): API-only pull + in-memory filter + windowed scroll ---
const filteredUsers = computed(() => {
    const list = users.value ?? [];
    const search = (queryOptions.value.search ?? "").trim().toLowerCase();
    const selectedGroups = queryOptions.value.groups ?? [];

    return list.filter((user) => {
        if (search) {
            const email = (user.email ?? "").toLowerCase();
            const name = (user.name ?? "").toLowerCase();
            const matchesSearch = email.includes(search) || name.includes(search);
            if (!matchesSearch) return false;
        }

        if (selectedGroups.length > 0) {
            const memberOf = user.memberOf ?? [];
            const inSelectedGroup = selectedGroups.some((g) => memberOf.includes(g));
            if (!inSelectedGroup) return false;
        }
        return true;
    });
});

const { visible: visibleUsers } = useInfiniteScrollList(filteredUsers, {
    pageSize: 20,
    resetWhen: [() => queryOptions.value.search, () => queryOptions.value.groups],
});

const browseLoading = computed(() => isFetching.value && !(users.value?.length ?? 0));

// --- Search (≥3 chars): server-side strict FTS. The group filter is forwarded to the server
// (memberOf ∩ groups). The search term is already debounced upstream (UserFilterOptions,
// 500ms), so the composable's own debounce is disabled. ---
const searchTerm = computed(() => queryOptions.value.search ?? "");
const search = useServerFtsSearch(searchTerm, {
    docType: DocType.User,
    filters: () => ({ groups: queryOptions.value.groups }),
    pageSize: 20,
    debounceMs: 0,
});
const searchIsLoading = search.isLoading;
const searchIsStale = search.isStale;

const { sentinel: searchSentinel } = useInfiniteScrollLoadMore({
    hasMore: () => searchActive.value && search.hasMore.value,
    isLoading: () => search.isLoading.value,
    onLoadMore: () => search.loadMore(),
});

// --- Unified display: server results when searching, the in-memory window when browsing ---
const displayedUsers = computed<UserDto[]>(() =>
    searchActive.value ? (search.docs.value as UserDto[]) : visibleUsers.value,
);
</script>

<template>
    <BasePage
        title="User overview"
        :should-show-page-title="false"
        :is-full-width="true"
        :loading="!searchActive && browseLoading"
    >
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew && isConnected">
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="openCreateUserModal"
                    name="createUserBtn"
                >
                    Create user
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="openCreateUserModal"
                />
            </div>
        </template>
        <template #internalPageHeader>
            <UserFilterOptions
                :is-small-screen="isSmallScreen"
                :groups="groups"
                v-model:query-options="queryOptions"
            />
        </template>
        <div class="mt-1 flex flex-col gap-[3px]">
            <p class="mb-2 px-2 py-1 text-gray-500">
                Users only need to be created when they require special permissions that are not
                already automatically granted. It's possible to add multiple user objects with the
                same email address. This allows different administrators to independently assign
                access to the same individual for different groups they manage.
            </p>
            <FtsStaleResultsBanner
                v-if="searchActive"
                :visible="searchIsStale"
                :loading="searchIsLoading"
                @refresh="search.refresh()"
            />
            <UserDisplayCard
                v-for="user in displayedUsers"
                :key="user._id"
                :usersDoc="user"
                :has-local-changes="hasLocalChanges"
                v-model="isEditUserModalVisible"
                @edit="(id) => (selectedUserId = id)"
            />

            <div
                v-if="searchActive && !searchIsLoading && displayedUsers.length === 0"
                class="flex h-32 w-full items-center justify-center gap-2"
            >
                <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                <p class="text-sm text-zinc-500">No users found.</p>
            </div>

            <!-- Infinite-scroll trigger for the server-paged search results -->
            <div v-if="searchActive" ref="searchSentinel" class="h-px w-full"></div>

            <div
                v-if="searchActive && searchIsLoading"
                class="flex h-16 w-full items-center justify-center"
            >
                <LoadingBar />
            </div>
        </div>

        <CreateOrEditUser
            v-if="isEditUserModalVisible || isNewUserModalVisible"
            :isVisible="isEditUserModalVisible || isNewUserModalVisible"
            :id="isNewUserModalVisible ? newUserId : selectedUserId"
            :is-create="isNewUserModalVisible"
            @close="
                isEditUserModalVisible = false;
                isNewUserModalVisible = false;
                if (searchActive) search.markStale();
            "
        />
    </BasePage>
</template>
