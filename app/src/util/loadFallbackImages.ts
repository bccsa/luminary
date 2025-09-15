export const loadFallbackImageUrls = async () => {
    // const images = import.meta.glob<string>("@/assets/fallbackImages/*.{png,jpg,jpeg,webp}", {
    //     eager: true,
    //     import: "default",
    // });

    const fallbackImages = [
      "/bernd.webp",
      "/blossoms.webp",
      "/david.webp",
      "/georgia.webp",
      "/jura.webp",
      "/lake.webp",
      "/landscape.webp",
      "/logo_small.svg",
      "/logo.svg",
      "/mock-image.webp",
      "/namibia.webp",
      "/river.webp",
      "/sea.webp",
      "/sergey.webp",
      "/sunset.webp",
      "/sunset2.webp",
      "/sunset3.webp",
    ]

    // const fallbackImages: string[] = Object.values(images);

    // const preloadImage = (src: string) => {
    //   const img = new Image();
    //   img.src = src;
    // };

    // Preload all fallback images
    // fallbackImages.forEach(preloadImage);

    return fallbackImages;
};
