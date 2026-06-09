/**
 * Coarse-grid sampler for the map overlays.
 *
 * Windy keeps only the active overlay's data on the client, so sounding-derived
 * fields (cloud base, thermal top, CAPE …) can't be read per map pixel. Instead
 * we sample a coarse grid over the current viewport, fetch one meteogram per
 * point, and interpolate the result into a smooth canvas (see heatmap.ts).
 *
 * Full per-point profiles (all forecast hours) are cached, so changing the
 * forecast time only re-derives from cache — no extra network requests.
 */
import { getMeteogramForecastData } from '@windy/fetch';
import type { LatLon } from '@windy/interfaces.d';
import type { Products } from '@windy/rootScope.d';

import { loadSoundingsFromPayload } from './windyData';
import type { SoundingProfile } from '../types';

export type GridSize = 'S' | 'M' | 'L';

/** Columns × rows per grid size. Kept modest — every point is one HTTP fetch. */
export const GRID_DIMS: Record<GridSize, { cols: number; rows: number }> = {
    S: { cols: 8, rows: 6 },
    M: { cols: 12, rows: 9 },
    L: { cols: 16, rows: 12 },
};

export interface GridCell {
    lat: number;
    lon: number;
    /** All forecast-hour profiles at this point, or null if unavailable. */
    profiles: SoundingProfile[] | null;
}

export interface SampledGrid {
    cols: number;
    rows: number;
    /** Geographic extent actually sampled (overlay is placed over this). */
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    model: string;
    /** Row-major, length cols*rows. Row 0 = north (maxLat). */
    cells: GridCell[];
}

const PLUGIN = 'windy-plugin-xcgram';

// --- profile cache, keyed by model + quantised lat/lon -------------------------

const QUANT = 10; // 0.1° buckets — dedupe near-identical sample points
const cache = new Map<string, Promise<SoundingProfile[] | null>>();

const keyOf = (model: string, lat: number, lon: number) =>
    `${model}|${Math.round(lat * QUANT)}|${Math.round(lon * QUANT)}`;

const fetchProfiles = (model: Products, lat: number, lon: number): Promise<SoundingProfile[] | null> => {
    const key = keyOf(String(model), lat, lon);
    let pending = cache.get(key);
    if (!pending) {
        pending = getMeteogramForecastData(model, { lat, lon, step: 1 } as never, PLUGIN)
            .then(res => loadSoundingsFromPayload(res.data, String(model)))
            .catch(() => null);
        cache.set(key, pending);
    }
    return pending;
};

/** Drop cached samples (e.g. when the user forces a fresh recompute). */
export const clearGridCache = () => cache.clear();

// --- concurrency-limited grid fetch -------------------------------------------

const mapLimit = async <T, R>(
    items: T[],
    limit: number,
    fn: (item: T, i: number) => Promise<R>,
    onDone?: (completed: number, total: number) => void,
): Promise<R[]> => {
    const out: R[] = new Array(items.length);
    let next = 0;
    let done = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
            onDone?.(++done, items.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
};

export interface Bounds {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

/**
 * Sample a grid of soundings over `bounds`. Points sit at cell centres so the
 * overlay tiles align with the data. Progress is reported per completed fetch.
 */
export const sampleGrid = async (
    bounds: Bounds,
    model: Products,
    size: GridSize,
    onProgress?: (completed: number, total: number) => void,
): Promise<SampledGrid> => {
    const { cols, rows } = GRID_DIMS[size];
    const { minLat, maxLat, minLon, maxLon } = bounds;
    const dLat = (maxLat - minLat) / rows;
    const dLon = (maxLon - minLon) / cols;

    const points: { lat: number; lon: number }[] = [];
    for (let r = 0; r < rows; r++) {
        // Row 0 = north: start at the top of the box and step down.
        const lat = maxLat - (r + 0.5) * dLat;
        for (let c = 0; c < cols; c++) {
            const lon = minLon + (c + 0.5) * dLon;
            points.push({ lat, lon });
        }
    }

    const cells = await mapLimit(
        points,
        5,
        async ({ lat, lon }) => ({ lat, lon, profiles: await fetchProfiles(model, lat, lon) }),
        onProgress,
    );

    return { cols, rows, minLat, maxLat, minLon, maxLon, model: String(model), cells };
};
