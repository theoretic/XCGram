/**
 * Renders a SampledGrid as a smooth colour overlay on Windy's Leaflet map.
 *
 * The grid is painted into a tiny canvas (one pixel per sample) and placed as an
 * L.ImageOverlay over the sampled bounds; the browser bilinearly upscales it, so
 * a coarse grid still looks smooth. Re-deriving for a new time or layer is cheap
 * (no network) — only sampleGrid() hits the API.
 */
import { map } from '@windy/map';

import { derive } from './thermo';
import { colorize, type LayerDef } from './layers';
import type { SampledGrid } from './grid';
import type { SoundingProfile } from '../types';

// Leaflet is provided globally by Windy.
declare const L: any;

const nearestProfile = (profiles: SoundingProfile[], ts: number): SoundingProfile => {
    let best = profiles[0];
    let bestD = Infinity;
    for (const p of profiles) {
        const d = Math.abs(p.ts - ts);
        if (d < bestD) {
            bestD = d;
            best = p;
        }
    }
    return best;
};

/** Per-cell scalar for a layer at time `ts` (null where unavailable). */
export const gridValues = (
    grid: SampledGrid,
    layer: LayerDef,
    ts: number,
    agl: boolean,
): (number | null)[] =>
    grid.cells.map(cell => {
        if (!cell.profiles || !cell.profiles.length) return null;
        const profile = nearestProfile(cell.profiles, ts);
        const v = layer.value(profile, derive(profile), agl);
        return v == null || Number.isNaN(v) ? null : v;
    });

/** Min/max of finite values, honouring a layer's fixed domain when set. */
export const resolveDomain = (
    layer: LayerDef,
    values: (number | null)[],
): [number, number] => {
    if (layer.domain !== 'auto') return layer.domain;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || min === max) return [min || 0, (min || 0) + 1];
    return [min, max];
};

export class HeatOverlay {
    private overlay: any = null;

    /** Paint `values` (row-major, row 0 = north) and place/replace the overlay. */
    render(
        grid: SampledGrid,
        values: (number | null)[],
        domain: [number, number],
        layer: LayerDef,
        opacity: number,
    ): void {
        const { cols, rows } = grid;
        const canvas = document.createElement('canvas');
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = ctx.createImageData(cols, rows);
        const [lo, hi] = domain;
        const span = hi - lo || 1;
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            const o = i * 4;
            if (v == null) {
                img.data[o + 3] = 0; // transparent: no data
                continue;
            }
            const [r, g, b, a] = colorize(layer.mode, (v - lo) / span, 1);
            img.data[o] = r;
            img.data[o + 1] = g;
            img.data[o + 2] = b;
            img.data[o + 3] = a;
        }
        ctx.putImageData(img, 0, 0);

        const bounds = [
            [grid.minLat, grid.minLon],
            [grid.maxLat, grid.maxLon],
        ];
        const url = canvas.toDataURL();

        if (this.overlay) {
            this.overlay.setBounds(bounds);
            this.overlay.setUrl(url);
            this.overlay.setOpacity(opacity);
        } else {
            this.overlay = new L.ImageOverlay(url, bounds, {
                opacity,
                interactive: false,
                className: 'xcg-heat',
                pane: 'overlayPane',
            });
            this.overlay.addTo(map);
        }
    }

    setOpacity(opacity: number): void {
        this.overlay?.setOpacity(opacity);
    }

    remove(): void {
        this.overlay?.remove();
        this.overlay = null;
    }
}
