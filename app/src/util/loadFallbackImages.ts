export const loadFallbackImageUrls = async () => {
    const images = import.meta.glob("@/assets/fallbackImages/*.{png,jpg,jpeg,webp}", {
        eager: true,
        import: "default",
    });

    const fallbackImages = Object.values(images) as string[];

    // Preload all fallback images into browser cache to ensure offline availability
    const preloadPromises = fallbackImages.map((url: string) => {
        return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Failed to preload fallback image: ${url}`));
            img.src = url;
        });
    });

    // Use allSettled to not fail if one image fails to load
    await Promise.allSettled(preloadPromises);
    console.log("Fallback images preloaded into browser cache");

    return fallbackImages;
};
