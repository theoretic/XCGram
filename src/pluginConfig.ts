import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-xcgram',
    version: '0.2.0',
    icon: '🪂',
    title: 'XCGram — Sounding for pilots',
    description:
        'Interactive aerological sounding (Skew-T log-P) with plain-language explanations: cloud base, thermal top, CAPE, inversions, freezing level and wind shear for free-flight and XC pilots.',
    author: 'xcgram',
    repository: 'https://github.com/your/xcgram',
    desktopUI: 'rhpane',
    desktopWidth: 460,
    mobileUI: 'fullscreen',
    routerPath: '/xcgram',
    // Add an entry to the right-click context menu ("Show XCGram sounding")
    addToContextmenu: true,
    // Receive the picked LatLon whenever the user single-clicks the map
    listenToSingleclick: true,
    private: true,
};

export default config;
