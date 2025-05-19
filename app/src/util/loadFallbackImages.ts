export const loadFallbackImageUrls = async () => {
    // Can't use a dynamic path here, so had to resolve with a static path
    const images = import.meta.glob("@/assets/fallbackImages/*.{png,jpg,jpeg,webp}");
    const fallbackImages: string[] = [];

    for (const path in images) {
        fallbackImages.push(path.replace("@/assets", "/src/assets"));
    }

    return fallbackImages;
};
