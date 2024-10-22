// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sortByName(a: any, b: any) {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
}
