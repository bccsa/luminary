import { computed, type ComputedRef, type Ref } from "vue";
import {
    AclPermission,
    DocType,
    PublishStatus,
    type ContentDto,
    type ContentParentDto,
    type LanguageDto,
    verifyAccess,
} from "luminary-shared";

export type UseContentPermissionsOptions = {
    editableParent: Ref<ContentParentDto | undefined>;
    docType: DocType.Post | DocType.Tag;
    selectedLanguage: Ref<LanguageDto | undefined>;
    selectedContent: Ref<ContentDto | undefined>;
};

export type UseContentPermissions = {
    canTranslate: ComputedRef<boolean>;
    canPublish: ComputedRef<boolean>;
    canEditParent: ComputedRef<boolean>;
    canDelete: ComputedRef<boolean>;
};

/**
 * Derives the editor's permission flags from the parent's `memberOf` groups via
 * {@link verifyAccess}. A parent with no group is unrestricted. `canTranslate` also
 * factors in the selected language's groups and the published/publish-access rule.
 */
export function useContentPermissions(
    options: UseContentPermissionsOptions,
): UseContentPermissions {
    const { editableParent, docType, selectedLanguage, selectedContent } = options;

    // No group ⇒ unrestricted; otherwise consult the ACL on the parent's groups.
    const access = (permission: AclPermission, validation: "any" | "all" = "any") => {
        const parent = editableParent.value;
        if (!parent) return false;
        if (parent.memberOf.length === 0) return true;
        return verifyAccess(parent.memberOf, docType, permission, validation);
    };

    const canPublish = computed(() => access(AclPermission.Publish));
    const canEditParent = computed(() => access(AclPermission.Edit, "all"));
    const canDelete = computed(() => access(AclPermission.Delete, "all"));

    const canTranslate = computed(() => {
        const parent = editableParent.value;
        if (!parent) return false;
        if (parent.memberOf.length === 0) return true;
        if (!selectedLanguage.value) return false;
        if (!canPublish.value && selectedContent.value?.status === PublishStatus.Published)
            return false;
        if (!verifyAccess(parent.memberOf, docType, AclPermission.Translate)) return false;
        if (
            !verifyAccess(
                selectedLanguage.value.memberOf,
                DocType.Language,
                AclPermission.Translate,
            )
        )
            return false;
        return true;
    });

    return { canTranslate, canPublish, canEditParent, canDelete };
}
