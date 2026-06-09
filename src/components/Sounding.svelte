<div class="xcg-chart">
    <svg
        bind:this={svgEl}
        on:wheel|preventDefault={onWheel}
        on:pointerdown={onPointerDown}
        on:pointermove={onPointerMove}
        on:pointerup={onPointerUp}
        on:pointercancel={onPointerUp}
        on:pointerleave={() => (hover = null)}
        on:dblclick={resetZoom}
    ></svg>
    {#if view.k !== 1}
        <button class="xcg-zoom-reset" on:click={resetZoom} title="Reset zoom">⤢</button>
    {/if}
    {#if hover}
        <div class="xcg-readout" style="left:{hover.x + 12}px; top:{hover.y}px">
            <b>{Math.round(hover.gh).toLocaleString()} m</b> · {Math.round(hover.p)} hPa<br />
            T {hover.t.toFixed(1)}°C · Td {hover.td.toFixed(1)}°C<br />
            {compass(hover.dir)} {Math.round(hover.spd * 3.6)} km/h
        </div>
    {/if}
</div>

<script lang="ts">
    import * as d3 from 'd3';
    import { onMount } from 'svelte';

    import { theta, tempFromTheta, liftParcel, esat } from '../lib/thermo';
    import { EPS } from '../lib/levels';
    import type { Derived, SoundingProfile } from '../types';

    export let profile: SoundingProfile;
    export let derived: Derived;

    let svgEl: SVGSVGElement;
    let hover: { x: number; y: number; p: number; gh: number; t: number; td: number; spd: number; dir: number } | null =
        null;

    // NB: do not name a top-level const `W` — Windy's plugin loader binds every
    // `@windy/*` import to a global `W`, so a module-scope `W` shadows it and
    // throws "Cannot access 'W' before initialization" on load.
    const CW = 420;
    const H = 520;
    const M = { top: 12, right: 44, bottom: 28, left: 38 };
    const iw = CW - M.left - M.right;
    const ih = H - M.top - M.bottom;

    const P_BOT = 1050;
    const P_TOP = 150;
    const SKEW = 0.9; // how far isotherms lean right per unit height
    const MAX_K = 8; // max zoom factor

    // Uniform affine view transform applied to the whole drawing:
    //   screen = k * local + (x, y)
    // A single scale factor keeps every angle (skew/curve inclination) fixed and
    // allows panning in both directions.
    let view = { k: 1, x: 0, y: 0 };

    const yScale = d3.scaleLog().domain([P_BOT, P_TOP]).range([ih, 0]);
    const tScale = d3.scaleLinear().domain([-45, 40]).range([0, iw]);

    // Skewed pixel position of a (T,p) sample
    const X = (t: number, p: number) => tScale(t) + SKEW * (ih - yScale(p));
    const Y = (p: number) => yScale(p);

    const compass = (deg: number): string =>
        ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

    const dewpointAtW = (w: number, p: number): number => {
        const e = ((w / 1000) * p) / (EPS + w / 1000);
        const l = Math.log(e / 6.112);
        return (243.5 * l) / (17.67 - l);
    };

    const viewTransform = () => `translate(${view.x},${view.y}) scale(${view.k})`;

    const draw = () => {
        if (!svgEl) return;
        const svg = d3.select(svgEl).attr('viewBox', `0 0 ${CW} ${H}`);
        svg.selectAll('*').remove();
        // Everything lives inside one uniformly-scaled, pannable group.
        const root = svg.append('g').attr('class', 'zoomroot').attr('transform', viewTransform());
        const g = root.append('g').attr('transform', `translate(${M.left},${M.top})`);

        // clip to plot area
        const clipId = 'xcg-clip';
        svg.append('defs')
            .append('clipPath')
            .attr('id', clipId)
            .append('rect')
            .attr('width', iw)
            .attr('height', ih);
        const plot = g.append('g').attr('clip-path', `url(#${clipId})`);

        const pTicks = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 150];
        const sampleP = d3.range(P_BOT, P_TOP - 1, -10);

        // pressure grid + labels
        pTicks.forEach(p => {
            g.append('line')
                .attr('x1', 0)
                .attr('x2', iw)
                .attr('y1', Y(p))
                .attr('y2', Y(p))
                .attr('stroke', '#2a3340')
                .attr('stroke-width', 0.6);
            g.append('text')
                .attr('x', -6)
                .attr('y', Y(p) + 3)
                .attr('text-anchor', 'end')
                .attr('class', 'xcg-ax')
                .text(p);
        });

        // isotherms (skewed)
        d3.range(-40, 41, 10).forEach(t => {
            const line = d3
                .line<number>()
                .x(p => X(t, p))
                .y(p => Y(p));
            plot.append('path')
                .datum(sampleP)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', t === 0 ? '#3d6ea5' : '#243042')
                .attr('stroke-width', t === 0 ? 1.1 : 0.6);
            g.append('text')
                .attr('x', X(t, P_BOT))
                .attr('y', ih + 14)
                .attr('text-anchor', 'middle')
                .attr('class', 'xcg-ax')
                .text(t);
        });

        // dry adiabats
        d3.range(-30, 160, 10).forEach(thC => {
            const th = thC + 273.15;
            const pts = sampleP.map(p => ({ p, t: tempFromTheta(th, p) }));
            const line = d3
                .line<{ p: number; t: number }>()
                .x(d => X(d.t, d.p))
                .y(d => Y(d.p));
            plot.append('path')
                .datum(pts)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', '#3a2f1f')
                .attr('stroke-width', 0.6);
        });

        // isohumes (constant mixing ratio, dashed green)
        [1, 2, 4, 8, 16, 24].forEach(w => {
            const pts = sampleP
                .filter(p => p >= 300)
                .map(p => ({ p, t: dewpointAtW(w, p) }));
            const line = d3
                .line<{ p: number; t: number }>()
                .x(d => X(d.t, d.p))
                .y(d => Y(d.p));
            plot.append('path')
                .datum(pts)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', '#244a35')
                .attr('stroke-width', 0.5)
                .attr('stroke-dasharray', '2,3');
        });

        // environment temperature & dew point
        const env = profile.levels;
        const tLine = d3
            .line<typeof env[number]>()
            .x(d => X(d.t, d.p))
            .y(d => Y(d.p));
        const tdLine = d3
            .line<typeof env[number]>()
            .x(d => X(d.td, d.p))
            .y(d => Y(d.p));
        plot.append('path').datum(env).attr('d', tdLine).attr('fill', 'none').attr('stroke', '#3aa0ff').attr('stroke-width', 2);
        plot.append('path').datum(env).attr('d', tLine).attr('fill', 'none').attr('stroke', '#ff5a4d').attr('stroke-width', 2);

        // parcel ascent
        const parcel = liftParcel(env[0], env.map(l => l.p));
        const pLine = d3
            .line<{ p: number; t: number }>()
            .x(d => X(d.t, d.p))
            .y(d => Y(d.p));
        plot.append('path')
            .datum(parcel)
            .attr('d', pLine)
            .attr('fill', 'none')
            .attr('stroke', '#36d97a')
            .attr('stroke-width', 1.6)
            .attr('stroke-dasharray', '4,3');

        // markers: LCL & thermal top
        const mark = (gh: number | undefined, p: number | undefined, label: string, col: string) => {
            if (p == null) return;
            g.append('line')
                .attr('x1', 0)
                .attr('x2', iw)
                .attr('y1', Y(p))
                .attr('y2', Y(p))
                .attr('stroke', col)
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '6,4')
                .attr('opacity', 0.7);
            g.append('text')
                .attr('x', 4)
                .attr('y', Y(p) - 3)
                .attr('class', 'xcg-mark')
                .attr('fill', col)
                .text(label);
        };
        mark(derived.lcl?.gh, derived.lcl?.p, 'cloud base', '#cfcf4a');
        mark(derived.thermalTop?.gh, derived.thermalTop?.p, 'thermal top', '#36d97a');

        // wind barbs on the right margin
        const bx = iw + 16;
        env.forEach(l => {
            const spd = Math.hypot(l.u, l.v) * 1.94384; // knots
            if (Number.isNaN(spd)) return;
            const y = Y(l.p);
            const ang = Math.atan2(-l.v, -l.u); // direction wind blows toward, screen coords
            drawBarb(g, bx, y, ang, spd);
        });

        // transparent capture surface for pointer hover/zoom/pan
        g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent');
    };

    const drawBarb = (g: any, x: number, y: number, ang: number, kt: number) => {
        const len = 18;
        const ex = x + Math.cos(ang) * len;
        const ey = y + Math.sin(ang) * len;
        g.append('line').attr('x1', x).attr('y1', y).attr('x2', ex).attr('y2', ey).attr('stroke', '#cdd6e0').attr('stroke-width', 1);
        let rem = Math.round(kt / 5) * 5;
        let px = ex;
        let py = ey;
        const step = len / 5;
        const bx = Math.cos(ang + Math.PI / 2);
        const by = Math.sin(ang + Math.PI / 2);
        const back = (n: number) => {
            px -= Math.cos(ang) * step * n;
            py -= Math.sin(ang) * step * n;
        };
        while (rem >= 50) {
            g.append('polygon')
                .attr(
                    'points',
                    `${px},${py} ${px + bx * 7},${py + by * 7} ${px - Math.cos(ang) * step},${py - Math.sin(ang) * step}`,
                )
                .attr('fill', '#cdd6e0');
            back(1);
            rem -= 50;
        }
        while (rem >= 10) {
            g.append('line')
                .attr('x1', px)
                .attr('y1', py)
                .attr('x2', px + bx * 7)
                .attr('y2', py + by * 7)
                .attr('stroke', '#cdd6e0')
                .attr('stroke-width', 1);
            back(1);
            rem -= 10;
        }
        if (rem >= 5) {
            g.append('line')
                .attr('x1', px)
                .attr('y1', py)
                .attr('x2', px + bx * 4)
                .attr('y2', py + by * 4)
                .attr('stroke', '#cdd6e0')
                .attr('stroke-width', 1);
        }
    };

    // --- pointer → user-space helpers ------------------------------------------

    /** Client coords → svg user space (the 0..CW × 0..H viewBox). */
    const toSvg = (clientX: number, clientY: number) => {
        const rect = svgEl.getBoundingClientRect();
        return {
            sx: (clientX - rect.left) * (CW / rect.width),
            sy: (clientY - rect.top) * (H / rect.height),
        };
    };

    const applyTransform = () =>
        d3.select(svgEl).select('g.zoomroot').attr('transform', viewTransform());

    /** Keep the scaled drawing covering the viewport (no empty margins). */
    const clampPan = (v: { k: number; x: number; y: number }) => {
        const k = Math.max(1, Math.min(MAX_K, v.k));
        return {
            k,
            x: Math.max(CW * (1 - k), Math.min(0, v.x)),
            y: Math.max(H * (1 - k), Math.min(0, v.y)),
        };
    };

    /** Scale by `factor` about an svg-space pivot, holding that point fixed. */
    const zoomAbout = (sx: number, sy: number, factor: number) => {
        const k = Math.max(1, Math.min(MAX_K, view.k * factor));
        const f = k / view.k;
        view = clampPan({ k, x: sx - f * (sx - view.x), y: sy - f * (sy - view.y) });
        applyTransform();
    };

    const onWheel = (ev: WheelEvent) => {
        const { sx, sy } = toSvg(ev.clientX, ev.clientY);
        zoomAbout(sx, sy, ev.deltaY < 0 ? 1.15 : 1 / 1.15);
    };

    const resetZoom = () => {
        view = { k: 1, x: 0, y: 0 };
        applyTransform();
    };

    // --- pointer (pinch / drag-pan / hover) ------------------------------------

    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; mid: { sx: number; sy: number }; base: typeof view } | null = null;
    let pan: { sx: number; sy: number; base: typeof view } | null = null;

    const onPointerDown = (ev: PointerEvent) => {
        svgEl.setPointerCapture?.(ev.pointerId);
        pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pts.size === 2) {
            const [a, b] = [...pts.values()];
            pinch = {
                dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                mid: toSvg((a.x + b.x) / 2, (a.y + b.y) / 2),
                base: { ...view },
            };
            pan = null;
        } else if (pts.size === 1) {
            const { sx, sy } = toSvg(ev.clientX, ev.clientY);
            pan = { sx, sy, base: { ...view } };
        }
    };

    const onPointerMove = (ev: PointerEvent) => {
        if (pts.has(ev.pointerId)) pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

        if (pinch && pts.size >= 2) {
            const [a, b] = [...pts.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const k = Math.max(1, Math.min(MAX_K, pinch.base.k * (dist / pinch.dist)));
            const f = k / pinch.base.k;
            view = clampPan({
                k,
                x: pinch.mid.sx - f * (pinch.mid.sx - pinch.base.x),
                y: pinch.mid.sy - f * (pinch.mid.sy - pinch.base.y),
            });
            applyTransform();
            return;
        }
        if (pan && ev.buttons !== 0) {
            const { sx, sy } = toSvg(ev.clientX, ev.clientY);
            view = clampPan({
                k: pan.base.k,
                x: pan.base.x + (sx - pan.sx),
                y: pan.base.y + (sy - pan.sy),
            });
            applyTransform();
            return;
        }
        updateHover(ev);
    };

    const onPointerUp = (ev: PointerEvent) => {
        pts.delete(ev.pointerId);
        if (pts.size < 2) pinch = null;
        if (pts.size === 0) pan = null;
    };

    const updateHover = (ev: MouseEvent) => {
        const { sx, sy } = toSvg(ev.clientX, ev.clientY);
        // svg space → local drawing space → plot coords
        const lx = (sx - view.x) / view.k - M.left;
        const ly = (sy - view.y) / view.k - M.top;
        if (lx < 0 || lx > iw || ly < 0 || ly > ih) {
            hover = null;
            return;
        }
        const p = yScale.invert(ly);
        const env = profile.levels;
        // interpolate by pressure
        let a = env[0];
        let b = env[env.length - 1];
        for (let i = 0; i < env.length - 1; i++) {
            if (p <= env[i].p && p >= env[i + 1].p) {
                a = env[i];
                b = env[i + 1];
                break;
            }
        }
        const f = (Math.log(p) - Math.log(a.p)) / (Math.log(b.p) - Math.log(a.p) || 1);
        const lerp = (x: number, y: number) => x + f * (y - x);
        const t = lerp(a.t, b.t);
        const td = lerp(a.td, b.td);
        const u = lerp(a.u, b.u);
        const v = lerp(a.v, b.v);
        const gh = lerp(a.gh, b.gh);
        const rect = svgEl.getBoundingClientRect();
        // local point → svg space → css px for the readout
        const svgX = view.k * (M.left + X(t, p)) + view.x;
        const svgY = view.k * (M.top + Y(p)) + view.y;
        hover = {
            x: svgX * (rect.width / CW),
            y: svgY * (rect.height / H),
            p,
            gh,
            t,
            td,
            spd: Math.hypot(u, v),
            dir: (270 - (Math.atan2(v, u) * 180) / Math.PI) % 360,
        };
    };

    $: if (svgEl && profile) draw();
    onMount(draw);
</script>

<style lang="less">
    .xcg-chart {
        position: relative;
        width: 100%;
    }
    svg {
        width: 100%;
        height: auto;
        background: #0e1620;
        border-radius: 6px;
        touch-action: none; // let us handle wheel + pinch without page scroll
        cursor: grab;
        &:active {
            cursor: grabbing;
        }
    }
    .xcg-zoom-reset {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 22px;
        height: 22px;
        padding: 0;
        background: rgba(8, 14, 22, 0.85);
        border: 1px solid #2a3340;
        border-radius: 4px;
        color: #cdd6e0;
        font-size: 13px;
        line-height: 1;
        cursor: pointer;
    }
    .xcg-zoom-reset:hover {
        background: #16212e;
    }
    :global(.xcg-ax) {
        fill: #7c8a99;
        font-size: 9px;
    }
    :global(.xcg-mark) {
        font-size: 9px;
        font-weight: 600;
    }
    .xcg-readout {
        position: absolute;
        pointer-events: none;
        background: rgba(8, 14, 22, 0.92);
        border: 1px solid #2a3340;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 11px;
        line-height: 1.35;
        color: #e6edf3;
        white-space: nowrap;
        transform: translateY(-50%);
    }
</style>
