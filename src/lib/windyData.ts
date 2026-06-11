import { getMeteogramForecastData } from '@windy/fetch';
import { hasAny } from '@windy/subscription';
import type { LatLon } from '@windy/interfaces.d';
import type { MeteogramDataPayload, MeteogramDataHash } from '@windy/interfaces.d';
import type { Products } from '@windy/rootScope.d';

import { PRESSURE_LEVELS, k2c } from './levels';
import { dewpointFromRh } from './thermo';
import type { LevelDatum, SoundingProfile } from '../types';

const HOUR_MS = 3_600_000;

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
 * Linearly interpolate a synthetic SoundingProfile at timestamp `ts` between two
 * bracketing profiles. This is exactly what the native Windy sounding does: its
 * decompiled parse step picks the two forecast hours around the requested
 * timestamp and lerps every matching level (`Ye`/`Je` in
 * `_shared-nearest-radiosondes.js`).
 */
const interpProfile = (a: SoundingProfile, b: SoundingProfile, ts: number): SoundingProfile => {
    const f = (ts - a.ts) / (b.ts - a.ts);
    const lerp = (x: number, y: number) => x + f * (y - x);
    const levels: LevelDatum[] = a.levels.map((la, i) => {
        const lb = b.levels[i];
        if (!lb) return la;
        return {
            p: la.p,
            gh: lerp(la.gh, lb.gh),
            t: lerp(la.t, lb.t),
            td: lerp(la.td, lb.td),
            u: lerp(la.u, lb.u),
            v: lerp(la.v, lb.v),
            rh: la.rh != null && lb.rh != null ? lerp(la.rh, lb.rh) : la.rh,
        };
    });
    return { ts, levels, elevation: a.elevation };
};

/**
 * Fill gaps wider than 1 h with interpolated hourly profiles. No-op when the
 * server already delivered 1-hour data (Premium accounts), and skips pairs whose
 * level grids don't line up.
 */
const interpolateTo1h = (profiles: SoundingProfile[]): SoundingProfile[] => {
    if (profiles.length < 2) return profiles;
    const out: SoundingProfile[] = [];
    for (let i = 0; i < profiles.length - 1; i++) {
        const a = profiles[i];
        const b = profiles[i + 1];
        out.push(a);
        const gap = b.ts - a.ts;
        if (gap <= HOUR_MS || a.levels.length !== b.levels.length) continue;
        const steps = Math.round(gap / HOUR_MS);
        for (let s = 1; s < steps; s++) {
            out.push(interpProfile(a, b, a.ts + s * HOUR_MS));
        }
    }
    out.push(profiles[profiles.length - 1]);
    return out;
};

/**
 * Fetch a meteogram for a point and reshape it into per-hour SoundingProfiles.
 *
 * Mirrors the native Windy sounding's behaviour exactly (decompiled from
 * windy.com's `_shared-nearest-radiosondes.js`):
 *
 * 1. Request: `getMeteogramForecastData(model, { lat, lon, step: hasAny() ? 1 : 3 },
 *    { extended: 'true' })`. 1-hour resolution is a **Premium feature**, gated
 *    server-side on the session token — free accounts are served 3-hour data no
 *    matter what `step` says. The third argument is a query-params object, NOT
 *    the plugin name (a string there spreads into garbage query params).
 * 2. Display: the native sounding follows the 1-hour map timeline by **linearly
 *    interpolating between the two bracketing forecast profiles**, so its time
 *    axis reads 1 h even on 3-hour (free-tier) data. `interpolateTo1h` does the
 *    same; it is a no-op when the data is already hourly.
 */
export const loadSoundings = async (
    latLon: LatLon,
    model: Products,
): Promise<{ profiles: SoundingProfile[]; model: string; updateTs: number }> => {
    const params = { ...latLon, step: hasAny() ? 1 : 3 };
    const { data: payload } = await getMeteogramForecastData(
        model,
        params as never,
        { extended: 'true' } as never,
    );
    const updateTs = (payload as MeteogramDataPayload).header?.updateTs ?? 0;
    const raw = loadSoundingsFromPayload(payload, String(model));
    return { profiles: interpolateTo1h(raw), model: String(model), updateTs };
};
