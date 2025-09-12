import { getConnectionSpeed } from "@/globalConfig";
import {
    isConnected,
    type ContentDto,
    type ImageFileCollectionDto,
    type ImageFileDto,
} from "luminary-shared";

/**
 * Function that uses the same filtering logic as LImageProvider component
 * to determine which image collection would be used.
 */
export const activeImageCollection = (
    content: ContentDto,
    parentWidth: number = 400,
    desiredAspectRatio: number = 1.78,
): number => {
    if (!content.parentImageData?.fileCollections?.length) return 0;

    const fileCollections = content.parentImageData.fileCollections;

    // Get current connection state and speed
    const connectionSpeed = getConnectionSpeed();
    const isDesktop = window.innerWidth >= 768;

    // Use the same calculation logic as the component
    const calcImageLoadingTime = (imageFile: ImageFileDto) => {
        const sizePerPixel = 0.0000000368804; // Same as in LImageProvider
        const imageFileSize = imageFile.width * imageFile.height * sizePerPixel;
        return imageFileSize / (connectionSpeed / 8);
    };

    // Apply the same filtering logic as the component
    const filteredCollections = fileCollections
        .map((collection: ImageFileCollectionDto) => {
            const filteredImages = collection.imageFiles.filter(
                (imgFile: ImageFileDto) =>
                    !isConnected.value || // Bypass filtering when not connected
                    ((isDesktop || calcImageLoadingTime(imgFile) < 1) &&
                        imgFile.width <= parentWidth * 1.5),
            );

            // If no images pass the filter, include the smallest one as fallback
            if (filteredImages.length === 0 && collection.imageFiles.length > 0) {
                filteredImages.push(
                    collection.imageFiles.reduce((a: ImageFileDto, b: ImageFileDto) =>
                        a.width < b.width ? a : b,
                    ),
                );
            }

            return {
                ...collection,
                imageFiles: filteredImages,
            };
        })
        .filter((collection: any) => collection.imageFiles.length > 0);

    if (!filteredCollections.length) return 0;

    // Use the same aspect ratio calculation as the component
    const aspectRatios = filteredCollections
        .map((collection: any) => collection.aspectRatio)
        .reduce((acc: number[], cur: number) => {
            if (!acc.includes(cur)) acc.push(cur);
            return acc;
        }, [] as number[])
        .sort((a: number, b: number) => a - b);

    const closestAspectRatio = aspectRatios.reduce((acc: number, cur: number) => {
        return Math.abs(cur - desiredAspectRatio) < Math.abs(acc - desiredAspectRatio) ? cur : acc;
    }, aspectRatios[0]);

    // Find the index in the original fileCollections array
    const selectedCollection = filteredCollections.find(
        (collection: any) => collection.aspectRatio === closestAspectRatio,
    );

    if (!selectedCollection) return 0;

    const index = fileCollections.findIndex(
        (collection: ImageFileCollectionDto) =>
            collection.aspectRatio === selectedCollection.aspectRatio,
    );

    return index >= 0 ? index : 0;
};
