<div class="xcg-time">
    <input
        type="range"
        min="0"
        max={Math.max(0, profiles.length - 1)}
        bind:value={index}
        on:input={() => dispatch('change', index)}
    />
    <div class="xcg-time-label">{label}</div>
</div>

<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { SoundingProfile } from '../types';

    export let profiles: SoundingProfile[] = [];
    export let index = 0;

    const dispatch = createEventDispatcher();

    const fmt = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

    $: label = profiles[index] ? fmt.format(new Date(profiles[index].ts)) : '—';
</script>

<style lang="less">
    .xcg-time {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 8px 0 4px;
    }
    input[type='range'] {
        flex: 1;
        accent-color: #36d97a;
    }
    .xcg-time-label {
        min-width: 96px;
        text-align: right;
        font-size: 12px;
        color: #cdd6e0;
        font-variant-numeric: tabular-nums;
    }
</style>
