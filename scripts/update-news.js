/**
 * WindSpot - Update News Script
 * Fetches RSS and uses Gemini Flash to generate summaries
 */

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const RSS_FEEDS = [
  'https://surfertoday.com/rss',
  'https://www.windmag.com/rss',
  'https://www.thekitemag.com/rss',
];

async function fetchRSSFeed(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'WindSpot-Bot/1.0' } });
    if (!response.ok) return null;
    const xml = await response.text();
    const items = [];
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    const titleRegex = /<title>(.*?)<\/title>/;
    const descRegex = /<description>(.*?)<\/description>/;
    const linkRegex = /<link>(.*?)<\/link>/;
    const dateRegex = /<pubDate>(.*?)<\/pubDate>/;

    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
      const item = match[0];
      items.push({
        title: (item.match(titleRegex) || [, ''])[1].replace(/<[^>]*>/g, ''),
        description: (item.match(descRegex) || [, ''])[1].replace(/<[^>]*>/g, '').substring(0, 200),
        url: (item.match(linkRegex) || [, ''])[1],
        publishedAt: (item.match(dateRegex) || [, ''])[1],
      });
    }
    return items;
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e.message);
    return null;
  }
}

async function generateSummaryWithGemini(articles, locale) {
  if (!GEMINI_API_KEY) {
    console.log('⚠️ No GEMINI_API_KEY found, skipping AI summaries');
    return articles.map(a => ({
      ...a,
      summary: a.description,
      summaryEn: a.description,
    }));
  }

  const prompt = locale === 'pt'
    ? `Resume as seguintes notícias de desportos náuticos em português, focando em condições de ondas e vento para Portugal.

${articles.map(a => `Título: ${a.title}\nDescrição: ${a.description}`).join('\n\n')}`
    : `Summarize the following water sports news in English, focusing on wave and wind conditions for Portugal.

${articles.map(a => `Title: ${a.title}\nDescription: ${a.description}`).join('\n\n')}`;

  try {
    const response = await fetch(`${GEMINI_API}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
      }),
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return articles.map((a, i) => ({
      ...a,
      summary: summary.split('\n')[i * 2 + 1] || a.description,
      summaryEn: a.description,
    }));
  } catch (e) {
    console.error('Gemini API error:', e.message);
    return articles.map(a => ({
      ...a,
      summary: a.description,
      summaryEn: a.description,
    }));
  }
}

async function updateNews() {
  console.log('📰 WindSpot - Updating news...');

  const allArticles = [];
  for (const feed of RSS_FEEDS) {
    const articles = await fetchRSSFeed(feed);
    if (articles) allArticles.push(...articles);
  }

  console.log(`  Found ${allArticles.length} articles`);

  // Filter out articles with empty/invalid URLs
  const validArticles = allArticles.filter(a => {
    if (!a.url || a.url.trim() === '') {
      console.log(`⚠️ Skipping article with empty URL: ${a.title}`);
      return false;
    }
    try {
      new URL(a.url);
      return true;
    } catch {
      console.log(`⚠️ Skipping article with invalid URL: ${a.title} (${a.url})`);
      return false;
    }
  });

  console.log(`  Valid articles: ${validArticles.length}`);

  const ptNews = await generateSummaryWithGemini(validArticles.slice(0, 6), 'pt');

  const newsItems = ptNews.map((a, i) => ({
    id: `news-${Date.now()}-${i}`,
    title: a.title,
    titleEn: a.title,
    summary: a.summary,
    summaryEn: a.summaryEn,
    category: 'general',
    source: (() => {
      try {
        return new URL(a.url).hostname.replace('www.', '');
      } catch {
        return 'unknown';
      }
    })(),
    url: a.url,
    publishedAt: a.publishedAt || new Date().toISOString(),
    tags: [],
  }));

  const outputPath = path.join(__dirname, '../public/data/news.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(newsItems, null, 2));

  console.log(`\n✅ News saved to ${outputPath}`);
  console.log(`📰 Generated ${newsItems.length} news items`);
}

updateNews().catch(e => {
  console.error('❌ Fatal error in update-news.js:', e);
  process.exit(1);
});
