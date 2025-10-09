export const loadFallbackImageUrls = async () => {
    const images = import.meta.glob<string>("@/assets/fallbackImages/*.{png,jpg,jpeg,webp}", {
        eager: true,
        import: "default",
    });

    const fallbackImages: string[] = Object.values(images);

    const preloadImage = (src: string) => {
        const img = new Image();
        img.src = src;
    };

    fallbackImages.forEach(preloadImage);

    return fallbackImages;
};
