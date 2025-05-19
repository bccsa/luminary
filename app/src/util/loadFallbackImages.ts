export const loadFallbackImageUrls = async () => {
    const images = import.meta.glob("@/assets/fallbackImages/*.{png,jpg,jpeg,webp}", {
        eager: true,
        import: "default",
    });

    const fallbackImages = Object.values(images);

    return fallbackImages;
};
