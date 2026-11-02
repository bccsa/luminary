import '../src/generated/skin.css';
import '../src/styles.css';
import { createApp, h } from 'vue';
import AudioFullscreen from '../src/components/AudioFullscreen.vue';
import { DEFAULT_MESSAGES } from '../src/messages';

// The screen on its own, as an app hosts it over its own engine: the panel for chapters and up next is its own.
const params = new URLSearchParams(location.search);
const chapters = ['Introduction', 'The main idea', 'A story about a well', 'Going deeper, with a long title that has to be cut where the room runs out', 'Practical steps', 'Closing'].map(
    (title, i) => ({ startTime: i * 60, endTime: i * 60 + 60, title })
);
const noChapters = params.get('chapters') === 'none';
const noAuthor = params.get('author') === 'none';
const tracks = params.get('tracks') === '2' ? [{ id: 'en', label: 'English' }, { id: 'fr', label: 'Français' }] : [];
createApp({
    render: () =>
        h('div', { class: 'lmpl-root', style: 'position:fixed;inset:0;width:100%;height:100%;aspect-ratio:auto' }, [
            h(AudioFullscreen, {
                title: 'Why we get thirsty',
                subtitle: noAuthor ? undefined : 'Pastor Daniel',
                artwork: params.get('cover') ? { src: params.get('cover')! } : null,
                appearance: params.get('theme') === 'light' ? 'light' : 'dark',
                chapters: noChapters ? [] : chapters,
                currentTime: 75,
                duration: 360,
                bufferedEnd: 200,
                playing: false,
                chapterIndex: noChapters ? -1 : 1,
                playbackRate: 1,
                audioTracks: tracks,
                activeAudioTrackId: tracks.length ? 'en' : null,
                sleepTimer: null,
                hasBrowse: !noChapters,
                chaptersSheet: true,
                upNext: [
                    { id: 'a', title: 'Why we get thirsty, part two', subtitle: 'Pastor Daniel', section: 'Next in series' },
                    { id: 'b', title: 'Living water', subtitle: 'Sunday messages', section: 'Related' },
                ],
                skipBackSeconds: 10,
                skipForwardSeconds: 10,
                chapterMask: '',
                messages: DEFAULT_MESSAGES,
            }),
        ]),
}).mount('#app');
