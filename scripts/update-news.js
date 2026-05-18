/**
 * VenTu — Orchestrator: Multi-Source News Pipeline
 *
 * 4-stage pipeline:
 *   1. RSS fetch (primary source)
 *   2. Event detection from conditions data (factual)
 *   3. LLM auxiliary (categorise, translate, synthesise)
 *   4. Merge & persist with TTL/dedup
 *
 * Each stage is independent — failure in one does not block the others.
 * Logging by stage for debugging.
 */

const { fetchAllFeeds } = require('./news/fetch-rss');
const { detectEvents } = require('./news/detect-events');
const { categoriseItem, ensureBilingual, synthesiseEvent } = require('./news/llm-tasks');
const { mergeAndPersist, loadExisting } = require('./news/merge-persist');
const { callLLM } = require('./llm-fallback');

async function updateNews() {
  console.log('══════════════════════════════════════════════');
  console.log('  VenTu — News Update Pipeline');
  console.log('══════════════════════════════════════════════');
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  LLM providers: ${require('./llm-fallback').getAvailableProviders().map(p => p.name).join(', ') || 'NONE'}`);
  console.log('──────────────────────────────────────────────\n');

  const allNewItems = [];
  const errors = [];

  // ─── Etapa 1: RSS Fetch ─────────────────────────────────
  let rssItems = [];
  try {
    rssItems = await fetchAllFeeds();
    console.log(`   → RSS items to process: ${rssItems.length}`);
  } catch (e) {
    console.error('❌ Etapa 1 failed:', e.message);
    errors.push(`RSS: ${e.message}`);
  }

  // ─── Etapa 2: Event Detection ───────────────────────────
  let events = [];
  try {
    events = detectEvents();
    console.log(`   → Events detected: ${events.length}`);
  } catch (e) {
    console.error('❌ Etapa 2 failed:', e.message);
    errors.push(`Events: ${e.message}`);
  }

  // ─── Etapa 3: LLM Auxiliary ─────────────────────────────
  console.log('\n🤖  Etapa 3 — LLM auxiliary tasks...');

  // 3a: Categorise RSS items (only those where LLM adds value)
  const categorisedRss = [];
  for (const item of rssItems) {
    try {
      // Categorise via LLM; fallback to defaultCategory from feed config
      const category = await categoriseItem(item.title, item.summary, item.defaultCategory);
      item.category = category;
    } catch (e) {
      item.category = item.defaultCategory || 'general';
    }

    // Translate to bilingual
    try {
      await ensureBilingual(item);
    } catch (e) {
      // Keep original if translation fails
    }

    categorisedRss.push(item);
  }
  console.log(`   → Categorised ${categorisedRss.length} RSS items`);

  // 3b: Synthesise event news (Task C)
  const eventNews = [];
  for (const event of events) {
    try {
      const story = await synthesiseEvent(event);
      if (story) {
        eventNews.push({
          id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: story.title,
          titleEn: story.titleEn,
          summary: story.summary,
          summaryEn: story.summaryEn,
          category: event.category,
          source: 'VenTu AI',
          sourceType: 'llm',
          eventSeverity: event.eventSeverity,
          keyPoints: story.keyPoints || [],
          url: event.url,
          publishedAt: event.publishedAt,
          tags: event.tags || [],
        });
      } else {
        // Fallback: use raw event as item
        eventNews.push({
          id: event.id,
          title: event.title,
          titleEn: event.titleEn,
          summary: event.summary,
          summaryEn: event.summaryEn,
          category: event.category,
          source: event.source,
          sourceType: event.sourceType,
          eventSeverity: event.eventSeverity,
          keyPoints: [],
          url: event.url,
          publishedAt: event.publishedAt,
          tags: event.tags || [],
        });
      }
    } catch (e) {
      console.warn(`  ⚠️ Synthesise failed for event "${event.title}": ${e.message}`);
      // Fallback: raw event
      eventNews.push({
        id: event.id,
        title: event.title,
        titleEn: event.titleEn,
        summary: event.summary,
        summaryEn: event.summaryEn,
        category: event.category,
        source: event.source,
        sourceType: event.sourceType,
        eventSeverity: event.eventSeverity,
        keyPoints: [],
        url: event.url,
        publishedAt: event.publishedAt,
        tags: event.tags || [],
      });
    }
  }
  console.log(`   → Event stories: ${eventNews.length}`);

  // Combine all new items
  allNewItems.push(...categorisedRss, ...eventNews);
  console.log(`\n📦 Total new items from this run: ${allNewItems.length}`);

  // ─── Etapa 4: Merge & Persist ───────────────────────────
  try {
    const finalNews = mergeAndPersist(allNewItems);
    console.log('\n──────────────────────────────────────────────');
    console.log(`✅ Pipeline complete: ${finalNews.length} items in feed`);
    console.log('──────────────────────────────────────────────\n');

    finalNews.slice(0, 10).forEach((item, i) => {
      console.log(`  ${i + 1}. [${item.category.toUpperCase()}] ${(item.title || '').substring(0, 70)}`);
      console.log(`     ${item.source} · ${item.sourceType}`);
    });
    if (finalNews.length > 10) {
      console.log(`     … and ${finalNews.length - 10} more`);
    }

    if (errors.length > 0) {
      console.log('\n⚠️  Warnings/errors during this run:');
      errors.forEach((e) => console.log(`  - ${e}`));
    }
  } catch (e) {
    console.error('❌ Etapa 4 failed:', e.message);
    process.exit(1);
  }
}

updateNews().catch((e) => {
  console.error('❌ Fatal pipeline error:', e.message);
  process.exit(1);
});
