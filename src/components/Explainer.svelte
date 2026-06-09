<div class="xcg-explain">
    {#each items as it (it.id)}
        <div
            class="xcg-card xcg-{it.severity}"
            class:open={open[it.id]}
            on:click={() => (open[it.id] = !open[it.id])}
        >
            <div class="xcg-card-head">
                <span class="xcg-label">{it.label}</span>
                <span class="xcg-value">{it.value}</span>
            </div>
            {#if open[it.id]}
                <div class="xcg-card-body">
                    <p><b>What:</b> {it.what}</p>
                    <p><b>Why:</b> {it.why}</p>
                </div>
            {/if}
        </div>
    {/each}
</div>

<script lang="ts">
    import type { ExplainItem } from '../lib/explain';

    export let items: ExplainItem[] = [];

    let open: Record<string, boolean> = {};
</script>

<style lang="less">
    .xcg-explain {
        margin-top: 10px;
    }
    .xcg-card {
        border: 1px solid #243042;
        border-left-width: 3px;
        border-radius: 5px;
        padding: 7px 9px;
        margin-bottom: 6px;
        cursor: pointer;
        background: #121b26;
        transition: background 0.15s;
    }
    .xcg-card:hover {
        background: #16212e;
    }
    .xcg-card-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
    }
    .xcg-label {
        font-size: 12px;
        color: #aeb9c4;
    }
    .xcg-value {
        font-size: 13px;
        font-weight: 600;
        color: #e6edf3;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .xcg-card-body {
        margin-top: 6px;
        font-size: 11.5px;
        line-height: 1.45;
        color: #b9c4cf;
    }
    .xcg-card-body p {
        margin: 3px 0;
    }
    .xcg-good {
        border-left-color: #36d97a;
    }
    .xcg-neutral {
        border-left-color: #5a6b7c;
    }
    .xcg-warn {
        border-left-color: #e0a73a;
    }
    .xcg-bad {
        border-left-color: #ff5a4d;
    }
</style>
