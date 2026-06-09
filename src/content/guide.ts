/**
 * Folded in-panel guide: "How to read a Windy sounding".
 *
 * Long-form companion to the per-point Explainer cards. Covers the four
 * questions pilots ask first: what every element means, how to forecast
 * convection, how deep the convective layer is, and where cloud base sits.
 * Terminology is kept consistent with lib/explain.ts (red = temp, blue =
 * dew point, green = parcel; LCL = cloud base; EL = thermal top).
 */

export type GuideBlock =
    | { kind: 'p'; text: string }
    | { kind: 'list'; items: string[] }
    | { kind: 'formula'; text: string; note?: string }
    | { kind: 'tip'; text: string };

export interface GuideSection {
    id: string;
    title: string;
    /** One-line summary shown under the heading. */
    lead: string;
    blocks: GuideBlock[];
}

export const GUIDE: GuideSection[] = [
    {
        id: 'elements',
        title: '1 · Reading the diagram',
        lead: 'Axes, curves, shaded zones and wind — what each mark means.',
        blocks: [
            {
                kind: 'p',
                text:
                    'A sounding is a vertical slice of the atmosphere above one point at one time. ' +
                    'Height runs up the left axis (metres / feet MSL, with pressure in hPa beside it — ' +
                    'pressure compresses with height, so the scale is logarithmic). Temperature runs ' +
                    'along the bottom. Isotherms are skewed to the right with height (Skew-T) so the ' +
                    'curves spread out and small, day-making differences become visible.',
            },
            {
                kind: 'list',
                items: [
                    'Red curve — environment temperature. Its slope is stability: leaning hard left = unstable and thermic; vertical or leaning right = stable / inversion.',
                    'Blue curve — dew point (moisture). Where red and blue pinch together the air is near saturation: that height is where cloud forms.',
                    'Green line — the parcel: the path a sun-warmed surface bubble follows as it rises. Where it sits right of (warmer than) the red curve, the bubble is buoyant — that is your lift.',
                    'Gap red ↔ blue — the spread (dryness). Wide gap = dry air; a narrow gap aloft marks a cloud layer.',
                    'Wind barbs (right edge) — speed and direction per level. Half-barb 5 kt, full barb 10 kt, flag 50 kt. Watch direction change with height = shear.',
                ],
            },
            {
                kind: 'p',
                text:
                    'Background guide-lines: dry adiabats (unsaturated parcel cooling, ~1 °C/100 m), ' +
                    'moist adiabats (gentler cooling once saturated, latent heat released), and ' +
                    'mixing-ratio lines (constant humidity, used to lift the dew point).',
            },
        ],
    },
    {
        id: 'convection',
        title: '2 · Forecasting convection',
        lead: 'Will it be thermic, and when does it switch on?',
        blocks: [
            {
                kind: 'p',
                text:
                    'The sun heats the ground; air next to it warms and rises. A rising unsaturated ' +
                    'parcel cools at the dry adiabatic rate (~1 °C/100 m). Compare that parcel to the ' +
                    'environment (red curve): while the parcel stays warmer it keeps rising — that is ' +
                    'a thermal. Where it cools to match the environment, it stops.',
            },
            {
                kind: 'list',
                items: [
                    'Red curve leaning far left (steep lapse) = unstable = strong thermals.',
                    'Red curve vertical or kinking right = inversion / stable layer = thermals capped there.',
                    'A morning inversion near the ground must burn off before thermals start.',
                ],
            },
            {
                kind: 'p',
                text:
                    'Trigger temperature is the surface temperature whose dry adiabat just clears the ' +
                    'morning cap. Until the ground reaches it the air is lidded; once it does, thermals ' +
                    'switch on. CAPE (buoyant energy) tells you how punchy they are: a little (100–500 ' +
                    'J/kg) means usable thermals, a lot (>1500) flags strong convection and storm risk. ' +
                    'CIN is the strength of the lid that has to break first.',
            },
            {
                kind: 'tip',
                text:
                    'On Windy, slide the time forward through the day and watch the green parcel line ' +
                    'and the thermal zone grow as the surface warms.',
            },
        ],
    },
    {
        id: 'depth',
        title: '3 · Convection-layer thickness',
        lead: 'How deep is the working band of lift?',
        blocks: [
            {
                kind: 'p',
                text:
                    'The convective layer runs from its base (the ground, or the top of a morning ' +
                    'inversion once it has burnt off) up to the thermal top — the height where the ' +
                    'green parcel line finally meets the red curve (the Equilibrium Level).',
            },
            {
                kind: 'formula',
                text: 'convection depth = z(thermal top) − z(ground or inversion top)',
                note: 'Read both heights off the left axis and subtract.',
            },
            {
                kind: 'list',
                items: [
                    'Deep layer (> 2000 m) — high climbs, good XC potential.',
                    'Shallow (< 800 m) — weak, low, scratchy lift.',
                    'Capped sharply by an inversion — abrupt top-out at that height.',
                ],
            },
            {
                kind: 'tip',
                text:
                    'The thermal top rises through the day. Check it at your planned launch and landing ' +
                    'times, not just at midday.',
            },
        ],
    },
    {
        id: 'cloudbase',
        title: '4 · Condensation level / cloud base',
        lead: 'Where do cumulus form — and will they at all?',
        blocks: [
            {
                kind: 'p',
                text:
                    'Cloud base is the Lifting Condensation Level (LCL): the height a rising surface ' +
                    'parcel must reach before its moisture condenses into cumulus. On the diagram, lift ' +
                    'the surface temperature up a dry adiabat and the surface dew point up a ' +
                    'mixing-ratio line; where they meet is the LCL.',
            },
            {
                kind: 'formula',
                text: 'cloud base AGL (m) ≈ 125 × (T − Td)',
                note: 'T and Td = surface temperature and dew point in °C. e.g. 24 °C / 10 °C → spread 14 → ~1750 m AGL.',
            },
            {
                kind: 'list',
                items: [
                    'Cloud base below the thermal top → cumulus form; climbs work up to base (cloud-suck above). Base is your ceiling.',
                    'Cloud base above the thermal top → the parcel stops before saturating: blue thermals, no cumulus marker (a "blue day"). Ceiling = thermal top.',
                    'Very low base + lots of moisture + high CAPE → over-development, spread-out, rain and storms.',
                ],
            },
        ],
    },
    {
        id: 'workflow',
        title: 'Quick workflow',
        lead: 'A six-step read for any point.',
        blocks: [
            {
                kind: 'list',
                items: [
                    'Click your launch on the map to load its sounding.',
                    'Check the red-curve slope (stability) and the red ↔ blue spread (moisture).',
                    'Find the thermal top — depth of the lift band.',
                    'Find cloud base and compare it to the thermal top (cumulus vs blue day).',
                    'Read the wind barbs through the layer — drift and shear.',
                    'Slide the time to watch the day build and fade.',
                ],
            },
        ],
    },
];
