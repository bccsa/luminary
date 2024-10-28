// Code copied & adapted from https://stackoverflow.com/questions/33355528/filtering-an-array-with-a-function-that-returns-a-promise

function mapAsync<T, U>(
    array: T[],
    callbackfn: (value: T, index: number, array: T[]) => Promise<U>,
): Promise<U[]> {
    return Promise.all(array.map(callbackfn));
}

/**
 * Filter an array using an asyncronous callback function
 */
export async function filterAsync<T>(
    array: T[],
    callbackfn: (value: T, index: number, array: T[]) => Promise<boolean>,
): Promise<T[]> {
    const filterMap = await mapAsync(array, callbackfn);
    return array.filter((_, index) => filterMap[index]);
}

/**
 * Check if any element in an array satisfies an asyncronous callback function
 */
export async function someAsync<T>(
    array: T[],
    callbackfn: (value: T, index: number, array: T[]) => Promise<boolean>,
): Promise<boolean> {
    const filterMap = await mapAsync(array, callbackfn);
    return array.some((_, index) => filterMap[index]);
}
