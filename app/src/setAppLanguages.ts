import { type LanguageDto } from "luminary-shared";
import { toRaw } from "vue";
import {
    appLanguageIds,
    cmsLanguages,
    cmsDefaultLanguage,
    appLanguageList,
    appLanguageId,
} from "./globalConfig";
import * as _ from "lodash";

// export const validateAppLanguageList = () => {
//     if (!cmsLanguageList.value || cmsLanguageList.value.length === 0) return;

//     // Set CMS language(s) global refs
//     cmsDefaultLanguage.value = cmsLanguageList.value.find((l) => l.default === 1);

//     // Set the preferred language to the preferred language returned by the browser if it is not set
//     // The language is only set if there is a supported language for it otherwise it defaults to the CMS configured default language
//     if (!appLanguageListIds.value.length) {
//         const browserPreferredLanguageId = cmsLanguageList.value.find((l) =>
//             navigator.languages.includes(l.languageCode),
//         )?._id;

//         if (browserPreferredLanguageId) {
//             appLanguageListIds.value.push(browserPreferredLanguageId);
//         } else if (cmsDefaultLanguage.value) {
//             appLanguageListIds.value.push(cmsDefaultLanguage.value._id);
//         } else if (cmsLanguageList.value.length > 0) {
//             appLanguageListIds.value.push(cmsLanguageList.value[0]._id);
//         }
//     }

//     // Add the CMS defined default language to the list of preferred languages if it is not already there
//     if (
//         cmsDefaultLanguage.value &&
//         !appLanguageListIds.value.includes(cmsDefaultLanguage.value._id)
//     ) {
//         appLanguageListIds.value.push(cmsDefaultLanguage.value._id);
//     }

//     // Remove any language IDs that are not in the CMS language list
//     appLanguageListIds.value = appLanguageListIds.value.filter((id) =>
//         cmsLanguageList.value.map((l) => l._id).includes(id),
//     );
// };

let cmsLanguagesPrev: LanguageDto[] = [];
let appLanguageListIdsPrev: string[] = [];

export const setAppLanguages = () => {
    console.log("initLanguage watch1");

    if (cmsLanguages.value.length === 0) console.log("it is zero");
    if (!cmsLanguages.value || cmsLanguages.value.length === 0) return;

    console.log("initLanguage watch2");
    // Prevent updating if the monitored values are the same
    if (
        _.isEqual(toRaw(cmsLanguages.value), toRaw(cmsLanguagesPrev)) &&
        _.isEqual(toRaw(appLanguageIds.value), toRaw(appLanguageListIdsPrev))
    )
        return;
    cmsLanguagesPrev = _.cloneDeep(toRaw(cmsLanguages.value));
    appLanguageListIdsPrev = _.cloneDeep(toRaw(appLanguageIds.value as string[]));

    console.log("initLanguage watch3");

    // Set CMS language(s) global refs
    cmsDefaultLanguage.value = cmsLanguages.value.find((l) => l.default === 1);

    // Set the preferred language to the preferred language returned by the browser if it is not set
    // The language is only set if there is a supported language for it otherwise it defaults to the CMS configured default language
    if (!appLanguageIds.value.length) {
        const browserPreferredLanguageId = cmsLanguages.value.find((l) =>
            navigator.languages.includes(l.languageCode),
        )?._id;

        if (browserPreferredLanguageId) {
            appLanguageIds.value.push(browserPreferredLanguageId);
        } else if (cmsDefaultLanguage.value) {
            appLanguageIds.value.push(cmsDefaultLanguage.value._id);
        } else if (cmsLanguages.value.length > 0) {
            appLanguageIds.value.push(cmsLanguages.value[0]._id);
        }
    }

    // Add the CMS defined default language to the list of preferred languages if it is not already there
    if (cmsDefaultLanguage.value && !appLanguageIds.value.includes(cmsDefaultLanguage.value._id)) {
        appLanguageIds.value.push(cmsDefaultLanguage.value._id);
    }

    // Remove any language IDs that are not in the CMS language list
    appLanguageIds.value = appLanguageIds.value.filter((id) =>
        cmsLanguages.value.map((l) => l._id).includes(id),
    );

    // Set App language(s) global refs
    appLanguageList.value = cmsLanguages.value.filter((l) => appLanguageIds.value?.includes(l._id));
    // console.log("appLanguageList", appLanguageList.value);
    appLanguageId.value = appLanguageIds.value.length ? appLanguageIds.value[0] : undefined;
    console.log("appLanguageId - setAppLanguages", appLanguageId.value);
};
