export const loadFallbackImageUrls = () => {
    const images = import.meta.glob("@/assets/fallbackImages/*.{png,jpg,jpeg,webp}", {
        eager: true,
        import: "default",
    });

    const fallbackImages = Object.values(images) as string[];

    // Preload all fallback images into browser cache to ensure offline availability
    // Do this asynchronously without blocking the function return
    const preloadPromises = fallbackImages.map((url: string) => {
        return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Failed to preload fallback image: ${url}`));
            img.src = url;
        });
    });

    // Use allSettled to not fail if one image fails to load
    Promise.allSettled(preloadPromises).then(() => {});

    return fallbackImages;
};
