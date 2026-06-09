<div class="xcg-guide">
    <p class="xcg-guide-intro">
        How to read a Windy sounding for free-flight. Tap a section to expand.
    </p>

    {#each GUIDE as sec, i (sec.id)}
        <details class="xcg-section" open={i === 0}>
            <summary>
                <span class="xcg-sec-title">{sec.title}</span>
                <span class="xcg-sec-lead">{sec.lead}</span>
            </summary>

            {#each sec.blocks as block}
                {#if block.kind === 'p'}
                    <p class="xcg-p">{block.text}</p>
                {:else if block.kind === 'list'}
                    <ul class="xcg-ul">
                        {#each block.items as li}
                            <li>{li}</li>
                        {/each}
                    </ul>
                {:else if block.kind === 'formula'}
                    <div class="xcg-formula">
                        <code>{block.text}</code>
                        {#if block.note}<span class="xcg-note">{block.note}</span>{/if}
                    </div>
                {:else if block.kind === 'tip'}
                    <p class="xcg-tip">{block.text}</p>
                {/if}
            {/each}
        </details>
    {/each}
</div>

<script lang="ts">
    import { GUIDE } from '../content/guide';
</script>

<style lang="less">
    .xcg-guide {
        margin-top: 8px;
        color: #c4cdd7;
    }
    .xcg-guide-intro {
        font-size: 11.5px;
        color: #8b97a3;
        margin: 2px 0 10px;
    }
    .xcg-section {
        border: 1px solid #243042;
        border-radius: 5px;
        background: #121b26;
        margin-bottom: 6px;
        padding: 0 10px;
    }
    .xcg-section summary {
        cursor: pointer;
        list-style: none;
        padding: 8px 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .xcg-section summary::-webkit-details-marker {
        display: none;
    }
    .xcg-sec-title {
        font-size: 12.5px;
        font-weight: 600;
        color: #e6edf3;
    }
    .xcg-sec-lead {
        font-size: 11px;
        color: #8b97a3;
    }
    .xcg-p {
        font-size: 11.5px;
        line-height: 1.5;
        margin: 6px 0;
        color: #b9c4cf;
    }
    .xcg-ul {
        margin: 6px 0;
        padding-left: 16px;
    }
    .xcg-ul li {
        font-size: 11.5px;
        line-height: 1.45;
        margin: 4px 0;
        color: #b9c4cf;
    }
    .xcg-formula {
        margin: 8px 0;
        padding: 7px 9px;
        background: #0c141d;
        border-left: 3px solid #4a9eff;
        border-radius: 4px;
    }
    .xcg-formula code {
        display: block;
        font-size: 12px;
        color: #e6edf3;
        font-variant-numeric: tabular-nums;
    }
    .xcg-note {
        display: block;
        margin-top: 4px;
        font-size: 10.5px;
        color: #8b97a3;
        line-height: 1.4;
    }
    .xcg-tip {
        font-size: 11.5px;
        line-height: 1.45;
        margin: 8px 0;
        padding: 6px 9px;
        background: #0e1a14;
        border-left: 3px solid #36d97a;
        border-radius: 4px;
        color: #b9d4c2;
    }
</style>
