/** Record the awaited startup step without depending on Vue or the data layer. */
export function setBootStage(stage: string): void {
    if (import.meta.env.DEV) document.documentElement.dataset.bootStage = stage;
}
