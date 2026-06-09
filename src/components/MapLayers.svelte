<div class="xcg-layers">
    <p class="xcg-ly-intro">
        Colour the map with values computed from soundings sampled across the
        current view. One forecast fetch per grid point — keep the grid modest.
    </p>

    <div class="xcg-ly-row">
        <label>Layer</label>
        <select bind:value={layerId}>
            {#each LAYERS as l}
                <option value={l.id}>{l.label}</option>
            {/each}
        </select>
    </div>

    <div class="xcg-ly-row">
        <label>Grid</label>
        <div class="xcg-seg">
            {#each ['S', 'M', 'L'] as s}
                <button class:active={gridSize === s} on:click={() => (gridSize = s)}>{s}</button>
            {/each}
        </div>
        {#if def.heightBased}
            <div class="xcg-seg">
                <button class:active={!agl} on:click={() => (agl = false)}>MSL</button>
                <button class:active={agl} on:click={() => (agl = true)}>AGL</button>
            </div>
        {/if}
    </div>

    <div class="xcg-ly-row">
        <button class="xcg-compute" on:click={compute} disabled={status === 'sampling'}>
            {status === 'sampling' ? `Sampling ${progress.done}/${progress.total}…` : 'Compute overlay'}
        </button>
    </div>

    {#if status === 'error'}
        <p class="xcg-ly-err">Sampling failed for this view.</p>
    {/if}

    {#if grid}
        <div class="xcg-ly-row">
            <label>Opacity</label>
            <input type="range" min="0.1" max="1" step="0.05" bind:value={opacity} />
        </div>

        <div class="xcg-legend">
            <div class="xcg-legend-bar" style="background:{legendGradient(def.mode)}"></div>
            <div class="xcg-legend-ax">
                <span>{def.minLabel}{domainText ? ` · ${domainText[0]}` : ''}</span>
                <span>{def.label}{def.unit ? ` (${def.unit})` : ''}</span>
                <span>{def.maxLabel}{domainText ? ` · ${domainText[1]}` : ''}</span>
            </div>
        </div>
        <p class="xcg-ly-foot">
            Sampled {grid.cols}×{grid.rows} · time follows the Diagram slider.
        </p>
    {/if}
</div>

<script lang="ts">
    import { map } from '@windy/map';
    import { onDestroy } from 'svelte';

    import { sampleGrid, type GridSize, type SampledGrid } from '../lib/grid';
    import { LAYERS, layerById, legendGradient, type LayerId } from '../lib/layers';
    import { HeatOverlay, gridValues, resolveDomain } from '../lib/heatmap';

    export let model: string;
    /** Selected forecast timestamp (from the Diagram time slider). */
    export let ts: number;
    /** Bumped by the parent on data refresh — invalidate the current overlay. */
    export let refresh = 0;

    let layerId: LayerId = 'cloudbase';
    let gridSize: GridSize = 'M';
    let agl = true;
    let opacity = 0.7;

    let grid: SampledGrid | null = null;
    let status: 'idle' | 'sampling' | 'ready' | 'error' = 'idle';
    let progress = { done: 0, total: 0 };
    let domainText: [string, string] | null = null;

    const heat = new HeatOverlay();

    $: def = layerById(layerId);

    const compute = async () => {
        const b = map.getBounds();
        const bounds = {
            minLat: Math.max(-85, b.getSouth()),
            maxLat: Math.min(85, b.getNorth()),
            minLon: b.getWest(),
            maxLon: b.getEast(),
        };
        status = 'sampling';
        progress = { done: 0, total: 0 };
        try {
            grid = await sampleGrid(bounds, model as never, gridSize, (done, total) => {
                progress = { done, total };
            });
            status = 'ready';
            renderLayer();
        } catch {
            status = 'error';
        }
    };

    const renderLayer = () => {
        if (!grid) return;
        const values = gridValues(grid, def, ts, agl);
        const domain = resolveDomain(def, values);
        heat.render(grid, values, domain, def, opacity);
        domainText = def.heightBased
            ? [`${Math.round(domain[0])}`, `${Math.round(domain[1])} m`]
            : null;
    };

    // Re-render (no refetch) when the layer, height ref, or forecast time changes.
    $: if (grid && (layerId || agl || ts != null)) renderLayer();
    // Opacity is a cheap overlay property — no repaint needed.
    $: heat.setOpacity(opacity);
    // A new model — or a data refresh — invalidates the sampled grid.
    $: if (model || refresh) {
        grid = null;
        status = 'idle';
        heat.remove();
    }

    onDestroy(() => heat.remove());
</script>

<style lang="less">
    .xcg-layers {
        margin-top: 8px;
        color: #c4cdd7;
    }
    .xcg-ly-intro {
        font-size: 11.5px;
        color: #8b97a3;
        margin: 2px 0 10px;
        line-height: 1.5;
    }
    .xcg-ly-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 7px 0;
    }
    .xcg-ly-row label {
        font-size: 11.5px;
        color: #8b97a3;
        min-width: 46px;
    }
    select {
        background: #16212e;
        color: #e6edf3;
        border: 1px solid #2a3340;
        border-radius: 4px;
        padding: 3px 6px;
        font-size: 12px;
        flex: 1;
    }
    .xcg-seg {
        display: inline-flex;
        border: 1px solid #2a3340;
        border-radius: 4px;
        overflow: hidden;
    }
    .xcg-seg button {
        background: #16212e;
        color: #8b97a3;
        border: none;
        padding: 3px 9px;
        font-size: 11.5px;
        cursor: pointer;
    }
    .xcg-seg button.active {
        background: #2a3a4d;
        color: #e6edf3;
    }
    .xcg-compute {
        flex: 1;
        background: #1f6feb;
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 7px 10px;
        font-size: 12.5px;
        cursor: pointer;
    }
    .xcg-compute:disabled {
        background: #24527e;
        cursor: default;
    }
    .xcg-ly-err {
        color: #ff8079;
        font-size: 11.5px;
    }
    input[type='range'] {
        flex: 1;
    }
    .xcg-legend {
        margin: 10px 0 4px;
    }
    .xcg-legend-bar {
        height: 10px;
        border-radius: 3px;
        border: 1px solid #2a3340;
    }
    .xcg-legend-ax {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #8b97a3;
        margin-top: 3px;
    }
    .xcg-ly-foot {
        font-size: 10.5px;
        color: #6f7d8a;
        margin-top: 8px;
    }
</style>
