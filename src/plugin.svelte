<div class="plugin__mobile-header">{title}</div>
<section class="plugin__content xcg-root">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={() => bcast.emit('rqstOpen', 'menu')}
    >
        {title}
    </div>

    <div class="xcg-tabs">
        <button class:active={tab === 'diagram'} on:click={() => (tab = 'diagram')}>Diagram</button>
        <button class:active={tab === 'layers'} on:click={() => (tab = 'layers')}>Layers</button>
        <button class:active={tab === 'guide'} on:click={() => (tab = 'guide')}>Guide</button>
    </div>

    {#if outdated}
        <div class="xcg-stale">
            <span class="xcg-stale-msg">⚠ Data outdated — a newer {model} run is available. Refresh advised.</span>
            <button class="xcg-stale-btn" on:click={refresh} disabled={status === 'loading'}>
                {status === 'loading' ? 'Refreshing…' : 'Refresh'}
            </button>
        </div>
    {/if}

    <!-- Shared on Diagram + Layers: model select and forecast timeline -->
    {#if tab !== 'guide'}
        <div class="xcg-controls">
            <select bind:value={model} on:change={reload}>
                {#each MODELS as mdl}
                    <option value={mdl.id}>{mdl.label}</option>
                {/each}
            </select>
            <span class="xcg-place">{place}</span>
        </div>
        {#if profiles.length}
            <TimeSlider {profiles} bind:index on:change={onTime} />
        {/if}
    {/if}

    {#if tab === 'guide'}
        <Guide />
    {:else if tab === 'layers'}
        <MapLayers {model} ts={layerTs} refresh={refreshNonce} />
    {:else if status === 'idle'}
        <p class="xcg-hint">Click anywhere on the map to load a sounding, or right-click → “{title}”.</p>
    {:else if status === 'loading'}
        <p class="xcg-hint">Loading forecast…</p>
    {:else if status === 'error'}
        <p class="xcg-hint xcg-err">Could not load data for this point.</p>
    {:else if profile && derived}
        <Sounding {profile} {derived} />
        <Explainer items={items} />
        <div class="xcg-foot">Model: {modelName} · {profiles.length} steps</div>
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';
    import { map } from '@windy/map';
    import { singleclick } from '@windy/singleclick';
    import products from '@windy/products';
    import { onDestroy, onMount } from 'svelte';
    import type { LatLon } from '@windy/interfaces.d';

    import config from './pluginConfig';
    import { loadSoundings } from './lib/windyData';
    import { clearGridCache } from './lib/grid';
    import { derive } from './lib/thermo';
    import { explain, type ExplainItem } from './lib/explain';
    import type { Derived, SoundingProfile } from './types';

    import TimeSlider from './components/TimeSlider.svelte';
    import Sounding from './components/Sounding.svelte';
    import Explainer from './components/Explainer.svelte';
    import Guide from './components/Guide.svelte';
    import MapLayers from './components/MapLayers.svelte';

    const { title, name } = config;

    let tab: 'diagram' | 'layers' | 'guide' = 'diagram';

    const MODELS = [
        { id: 'ecmwf', label: 'ECMWF' },
        { id: 'gfs', label: 'GFS' },
        { id: 'icon-eu', label: 'ICON-EU' },
        { id: 'icon-d2', label: 'ICON-D2' },
        { id: 'arome', label: 'AROME' },
    ];

    let model = 'ecmwf';
    let latLon: LatLon | null = null;
    let profiles: SoundingProfile[] = [];
    let index = 0;
    let place = '';
    let status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    let modelName = '';

    /** Model update time of the data we currently hold (from the fetch header). */
    let loadedUpdateTs = 0;
    /** Ticks every minute so staleness re-evaluates while the panel stays open. */
    let nowTick = Date.now();
    /** Bumped on refresh to invalidate the Layers overlay. */
    let refreshNonce = 0;

    // Windy product ids are camelCase (iconEu, iconD2); our list uses hyphens.
    const productKey = (m: string) => m.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

    /** Latest published model run for `m` (live, no fetch), or 0 if unknown. */
    const modelLatestUpdate = (m: string): number => {
        try {
            const prod = (products as Record<string, { calendar?: { updateTs?: number } }>)[
                productKey(m)
            ];
            return prod?.calendar?.updateTs ?? 0;
        } catch {
            return 0;
        }
    };

    // Outdated when a newer model run exists than the one our data came from.
    $: outdated =
        status !== 'loading' &&
        loadedUpdateTs > 0 &&
        (nowTick, modelLatestUpdate(model)) > loadedUpdateTs;

    $: profile = profiles[index] as SoundingProfile | undefined;
    $: derived = profile ? derive(profile) : (null as Derived | null);
    $: items = profile && derived ? explain(profile, derived) : ([] as ExplainItem[]);
    // Time the map overlays follow: the picked profile's hour, else the global timeline.
    $: layerTs = profile?.ts ?? (store.get('timestamp') as number) ?? Date.now();

    const load = async () => {
        if (!latLon) return;
        status = 'loading';
        try {
            const res = await loadSoundings(latLon, model as never);
            profiles = res.profiles;
            modelName = res.model;
            loadedUpdateTs = res.updateTs;
            index = nearestToNow(profiles);
            status = profiles.length ? 'ready' : 'error';
        } catch (e) {
            console.error('[xcgram] load failed', e);
            status = 'error';
        }
    };

    const reload = () => load();

    /** Re-fetch the latest model data in place (no page reload). */
    const refresh = () => {
        clearGridCache(); // overlays will re-sample fresh on next Compute
        refreshNonce++; // tell MapLayers to drop its stale overlay
        load();
    };

    const nearestToNow = (ps: SoundingProfile[]): number => {
        const now = (store.get('timestamp') as number) ?? Date.now();
        let best = 0;
        let bestD = Infinity;
        ps.forEach((p, i) => {
            const d = Math.abs(p.ts - now);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        return best;
    };

    const setPoint = (ll: LatLon) => {
        latLon = ll;
        place = `${ll.lat.toFixed(3)}, ${ll.lon.toFixed(3)}`;
        load();
    };

    const onTime = (e: CustomEvent<number>) => (index = e.detail);

    const onSingleClick = (ll: LatLon) => setPoint(ll);

    // Opened from context menu (receives LatLon) or URL
    export const onopen = (params: unknown) => {
        const ll = params as Partial<LatLon> | undefined;
        if (ll && typeof ll.lat === 'number' && typeof ll.lon === 'number') {
            setPoint(ll as LatLon);
        }
    };

    onMount(() => {
        const p = store.get('product') as string | undefined;
        if (p && MODELS.some(m => m.id === p)) model = p;
        singleclick.on(name, onSingleClick);
        // Seed a sounding at the map centre so the timeline exists before any click.
        if (!latLon) {
            const c = map.getCenter();
            setPoint({ lat: c.lat, lon: c.lng });
        }
    });

    const staleTimer = setInterval(() => (nowTick = Date.now()), 60_000);

    onDestroy(() => {
        singleclick.off(name, onSingleClick);
        clearInterval(staleTimer);
    });
</script>

<style lang="less">
    .xcg-root {
        padding: 6px 10px 16px;
        color: #e6edf3;
    }
    .xcg-tabs {
        display: flex;
        gap: 4px;
        margin: 8px 0 4px;
        border-bottom: 1px solid #243042;
    }
    .xcg-tabs button {
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: #8b97a3;
        font-size: 12.5px;
        padding: 5px 10px;
        cursor: pointer;
    }
    .xcg-tabs button.active {
        color: #e6edf3;
        border-bottom-color: #4a9eff;
    }
    .xcg-stale {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0 4px;
        padding: 6px 9px;
        background: #2a1f12;
        border: 1px solid #5a4220;
        border-left: 3px solid #e0a73a;
        border-radius: 5px;
    }
    .xcg-stale-msg {
        flex: 1;
        font-size: 11.5px;
        line-height: 1.4;
        color: #e8c98a;
    }
    .xcg-stale-btn {
        background: #e0a73a;
        color: #1a1206;
        border: none;
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
    }
    .xcg-stale-btn:disabled {
        opacity: 0.6;
        cursor: default;
    }
    .xcg-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0;
    }
    select {
        background: #16212e;
        color: #e6edf3;
        border: 1px solid #2a3340;
        border-radius: 4px;
        padding: 3px 6px;
        font-size: 12px;
    }
    .xcg-place {
        font-size: 12px;
        color: #8b97a3;
        font-variant-numeric: tabular-nums;
    }
    .xcg-hint {
        font-size: 12.5px;
        color: #aeb9c4;
        line-height: 1.5;
        padding: 6px 2px;
    }
    .xcg-err {
        color: #ff8079;
    }
    .xcg-foot {
        margin-top: 8px;
        font-size: 10.5px;
        color: #6f7d8a;
        text-align: right;
    }
</style>
