import { computed, useAttrs } from "vue";

export function useAttrsWithoutStyles() {
  const attrs = useAttrs();
  const attrsWithoutStyles = computed(() => {
    const returnObj: Record<string, unknown> = {};
    for (const attr in attrs) {
      if (attr !== "class" && attr !== "style") {
        returnObj[attr] = attrs[attr];
      }
    }
    return returnObj;
  });

  return { attrs, attrsWithoutStyles };
}
