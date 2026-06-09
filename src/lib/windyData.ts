import { getMeteogramForecastData } from '@windy/fetch';
import type { LatLon } from '@windy/interfaces.d';
import type { MeteogramDataPayload, MeteogramDataHash } from '@windy/interfaces.d';
import type { Products } from '@windy/rootScope.d';

import { PRESSURE_LEVELS, k2c } from './levels';
import { dewpointFromRh } from './thermo';
import type { LevelDatum, SoundingProfile } from '../types';

const PLUGIN = 'windy-plugin-xcgram';

/** Read a numeric series for `layer-level` at hour index i, or NaN. */
const at = (d: MeteogramDataHash, key: string, i: number): number => {
    const arr = (d as Record<string, (number | null)[]>)[key];
    const v = arr ? arr[i] : undefined;
    return v === null || v === undefined ? NaN : v;
};

/**
 * Turn an already-fetched meteogram payload into one SoundingProfile per
 * forecast hour. Temperatures arrive in Kelvin, heights in metres, wind in m/s.
 * Split out so the grid sampler can reshape cached payloads without re-fetching.
 */
export const loadSoundingsFromPayload = (
    payload: unknown,
    _model?: string,
): SoundingProfile[] => {
    const p = payload as MeteogramDataPayload;
    const d = p.data;
    const header = p.header as unknown as Record<string, number>;
    const elevation = header.elevation ?? header.modelElevation ?? 0;
    const hours = (d as unknown as { hours: number[] }).hours ?? [];

    const profiles: SoundingProfile[] = hours.map((ts, i) => {
        const levels: LevelDatum[] = [];

        // Surface level
        const st = k2c(at(d, 'temp-surface', i));
        if (!Number.isNaN(st)) {
            let std = k2c(at(d, 'dewpoint-surface', i));
            if (Number.isNaN(std)) {
                const rh = at(d, 'rh-surface', i);
                if (!Number.isNaN(rh)) std = dewpointFromRh(st, rh);
            }
            // Surface pressure: prefer the model field, else barometric estimate
            const sp = at(d, 'pressure-surface', i);
            const surfaceP = Number.isNaN(sp)
                ? 1013.25 * Math.exp(-elevation / 8400)
                : sp / 100; // Pa → hPa
            levels.push({
                p: surfaceP,
                gh: elevation,
                t: st,
                td: Number.isNaN(std) ? st - 3 : std,
                u: at(d, 'wind_u-surface', i),
                v: at(d, 'wind_v-surface', i),
                rh: at(d, 'rh-surface', i),
            });
        }

        // Isobaric levels
        for (const { key, p: pres } of PRESSURE_LEVELS) {
            const t = k2c(at(d, `temp-${key}`, i));
            const gh = at(d, `gh-${key}`, i);
            if (Number.isNaN(t) || Number.isNaN(gh)) continue;
            if (gh <= elevation) continue; // below ground
            let td = k2c(at(d, `dewpoint-${key}`, i));
            const rh = at(d, `rh-${key}`, i);
            if (Number.isNaN(td) && !Number.isNaN(rh)) td = dewpointFromRh(t, rh);
            levels.push({
                p: pres,
                gh,
                t,
                td: Number.isNaN(td) ? t - 5 : Math.min(td, t),
                u: at(d, `wind_u-${key}`, i),
                v: at(d, `wind_v-${key}`, i),
                rh: Number.isNaN(rh) ? undefined : rh,
            });
        }

        levels.sort((a, b) => a.gh - b.gh);
        return { ts, levels, elevation };
    });

    return profiles.filter(pr => pr.levels.length > 2);
};

/**
 * Fetch a meteogram for a point and reshape it into per-hour SoundingProfiles.
 */
export const loadSoundings = async (
    latLon: LatLon,
    model: Products,
): Promise<{ profiles: SoundingProfile[]; model: string; updateTs: number }> => {
    const { data: payload } = await getMeteogramForecastData(model, latLon, PLUGIN);
    const updateTs = (payload as MeteogramDataPayload).header?.updateTs ?? 0;
    return { profiles: loadSoundingsFromPayload(payload, String(model)), model: String(model), updateTs };
};
