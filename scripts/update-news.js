/**
 * VenTu - Update News Script
 * Uses LLM with fallback (Gemini → Groq → Cerebras) to generate daily surf conditions briefing
 * Falls back to RSS feeds if available
 */

const fs = require('fs');
const path = require('path');
const { callLLM } = require('./llm-fallback');

// RSS feeds to try (fallback)
const RSS_FEEDS = [
  'https://surfertoday.com/rss',
  'https://www.windmag.com/rss',
  'https://www.thekitemag.com/rss',
];

/**
 * Extract text from RSS item field, handling CDATA and HTML entities
 */
function extractField(itemXml, fieldName) {
  const cdataRegex = new RegExp(`<${fieldName}[\\s\\S]*?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${fieldName}>`);
  const cdataMatch = itemXml.match(cdataRegex);
  if (cdataMatch) {
    return decodeHtmlEntities(cdataMatch[1].trim());
  }
  
  const regularRegex = new RegExp(`<${fieldName}[\\s\\S]*?>([\\s\\S]*?)</${fieldName}>`);
  const regularMatch = itemXml.match(regularRegex);
  if (regularMatch) {
    return decodeHtmlEntities(regularMatch[1].replace(/<[^>]*>/g, '').trim());
  }
  
  return '';
}

function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function fetchRSSFeed(url) {
  try {
    const response = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 15000 
    });
    if (!response.ok) {
      console.warn(`  ⚠️ RSS feed returned ${response.status}: ${url}`);
      return null;
    }
    
    const xml = await response.text();
    const items = [];
    const itemRegex = /<item[\s\S]*?<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const item = match[0];
      
      const title = extractField(item, 'title');
      const description = extractField(item, 'description');
      const link = extractField(item, 'link');
      const pubDate = extractField(item, 'pubDate');
      
      if (!title || !link) continue;
      
      items.push({
        title,
        description: description.substring(0, 300),
        url: link,
        publishedAt: pubDate || new Date().toISOString(),
        source: new URL(url).hostname.replace('www.', '').replace('feeds.', ''),
      });
    }
    
    console.log(`  ✓ ${url}: ${items.length} articles extracted`);
    return items;
  } catch (e) {
    console.error(`  ✗ Failed to fetch ${url}:`, e.message);
    return null;
  }
}

/**
 * Load conditions data for news generation
 */
function loadConditions() {
  try {
    const filePath = path.join(__dirname, '../public/data/conditions.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('Failed to load conditions:', e.message);
  }
  return {};
}

/**
 * Find best spots today based on conditions
 */
function findBestSpots(conditions) {
  const spots = [];
  
  for (const [id, cond] of Object.entries(conditions)) {
    if (!cond) continue;
    
    const windKt = (cond.windSpeed || 0) * 1.94384;
    const waveHeight = cond.waveHeight || 0;
    
    // Score for surf: good waves + offshore wind
    let surfScore = 0;
    if (waveHeight > 0.5 && waveHeight < 3) surfScore += waveHeight * 20;
    if (windKt < 15) surfScore += 10;
    
    // Score for kitesurf: strong wind
    let kiteScore = 0;
    if (windKt > 15 && windKt < 30) kiteScore += windKt * 2;
    
    spots.push({
      id,
      windKt: Math.round(windKt),
      waveHeight: waveHeight.toFixed(1),
      waterTemp: (cond.waterTemp || 0).toFixed(1),
      surfScore,
      kiteScore,
    });
  }
  
  const bestSurf = [...spots].sort((a, b) => b.surfScore - a.surfScore).slice(0, 3);
  const bestKite = [...spots].sort((a, b) => b.kiteScore - a.kiteScore).slice(0, 3);
  
  return { bestSurf, bestKite, allSpots: spots };
}

/**
 * Generate daily briefing with LLM (Gemini → Groq → Cerebras fallback)
 */
async function generateDailyBriefing(spotData) {
  const { bestSurf, bestKite, allSpots } = spotData;
  const avgWind = allSpots.length > 0 
    ? (allSpots.reduce((sum, s) => sum + s.windKt, 0) / allSpots.length).toFixed(0)
    : 0;
  const avgWaves = allSpots.length > 0
    ? (allSpots.reduce((sum, s) => parseFloat(s.waveHeight) + sum, 0) / allSpots.length).toFixed(1)
    : 0;

  const prompt = `Cria 3 notícias curtas (2-3 frases cada) sobre condições de desportos náuticos em Portugal para hoje, baseado nestes dados reais:

MELHORES SPOTS SURF:
${bestSurf.map((s, i) => `${i+1}. ${s.id}: ${s.waveHeight}m ondas, ${s.windKt}kt vento`).join('\n')}

MELHORES SPOTS KITESURF:
${bestKite.map((s, i) => `${i+1}. ${s.id}: ${s.windKt}kt vento`).join('\n')}

MÉDIA NACIONAL: ${avgWind}kt vento, ${avgWaves}m ondas

Gera 3 notícias em português europeu com tom entusiástico e coloquial (tipo "brutal", "mesmo isso", "nortada forte"). Formato:
TÍTULO 1|SUMÁRIO 1
TÍTULO 2|SUMÁRIO 2
TÍTULO 3|SUMÁRIO 3`;

  try {
    console.log('   🤖 Calling LLM with fallback chain (Gemini → Groq → Cerebras)...');
    const text = await callLLM(prompt, { maxTokens: 1024 });
    
    console.log('📡 LLM raw text length:', text.length);
    
    const result = parseGeminiResponse(text);
    if (result.length === 0) {
      console.log('⚠️ LLM returned empty, using static fallback');
      return generateStaticBriefing(spotData);
    }
    
    return result;
  } catch (e) {
    console.error('LLM error:', e.message);
    return generateStaticBriefing(spotData);
  }
}

function parseGeminiResponse(text) {
  const lines = text.split('\n').filter(l => l.trim() && l.includes('|'));
  console.log('📄 Parsed lines:', lines.length);
  
  return lines.slice(0, 3).map((line, i) => {
    const [title, summary] = line.split('|').map(s => s.trim());
    return {
      id: `news-${Date.now()}-${i}`,
      title: title || `Notícia ${i+1}`,
      titleEn: title || `News ${i+1}`,
      summary: summary || 'Resumo não disponível',
      summaryEn: summary || 'Summary not available',
      category: i === 0 ? 'surf' : i === 1 ? 'kitesurf' : 'general',
      source: 'VenTu AI',
      url: 'https://ventu.surf',
      publishedAt: new Date().toISOString(),
      tags: ['portugal', 'condicoes', i === 0 ? 'surf' : i === 1 ? 'kitesurf' : 'geral'],
    };
  });
}

function generateStaticBriefing(spotData) {
  console.log('📝 Generating static briefing from spot data...');
  const { bestSurf, bestKite, allSpots } = spotData;
  
  const avgWind = allSpots.length > 0 
    ? (allSpots.reduce((sum, s) => sum + s.windKt, 0) / allSpots.length).toFixed(0)
    : 0;
  
  const surfSpot = bestSurf[0];
  const kiteSpot = bestKite[0];
  
  const news = [];
  
  if (surfSpot) {
    news.push({
      id: `news-${Date.now()}-surf`,
      title: `Ondas brutais em ${surfSpot.id.replace(/-/g, ' ')} hoje!`,
      titleEn: `Great waves at ${surfSpot.id.replace(/-/g, ' ')} today!`,
      summary: `Com ${surfSpot.waveHeight}m de ondas e apenas ${surfSpot.windKt}kt de vento, as condições estão mesmo boas para surf. Água a ${surfSpot.waterTemp}°C — leva a wetsuit!`,
      summaryEn: `With ${surfSpot.waveHeight}m waves and only ${surfSpot.windKt}kt wind, conditions are great for surfing. Water at ${surfSpot.waterTemp}°C — bring your wetsuit!`,
      category: 'surf',
      source: 'VenTu AI',
      url: `https://ventu.surf/pt/spots/${surfSpot.id}`,
      publishedAt: new Date().toISOString(),
      tags: [surfSpot.id, 'surf', 'condicoes', 'portugal'],
    });
  }
  
  if (kiteSpot) {
    news.push({
      id: `news-${Date.now()}-kite`,
      title: `Nortada forte em ${kiteSpot.id.replace(/-/g, ' ')}! 🪁`,
      titleEn: `Strong wind at ${kiteSpot.id.replace(/-/g, ' ')}! 🪁`,
      summary: `${kiteSpot.windKt}kt de vento steady — perfeito para kitesurf! As condições estão mesmo a dar para uma sessão épica.`,
      summaryEn: `${kiteSpot.windKt}kt steady wind — perfect for kitesurfing! Conditions are epic for a great session.`,
      category: 'kitesurf',
      source: 'VenTu AI',
      url: `https://ventu.surf/pt/spots/${kiteSpot.id}`,
      publishedAt: new Date().toISOString(),
      tags: [kiteSpot.id, 'kitesurf', 'vento', 'portugal'],
    });
  }
  
  news.push({
    id: `news-${Date.now()}-summary`,
    title: `Resumo nacional: média de ${avgWind}kt de vento`,
    titleEn: `National summary: ${avgWind}kt average wind`,
    summary: `Hoje temos condições variadas em Portugal. Melhores spots de surf: ${bestSurf.slice(0, 3).map(s => s.id.replace(/-/g, ' ')).join(', ')}. Para kitesurf: ${bestKite.slice(0, 3).map(s => s.id.replace(/-/g, ' ')).join(', ')}.`,
    summaryEn: `Today we have varied conditions in Portugal. Best surf spots: ${bestSurf.slice(0, 3).map(s => s.id.replace(/-/g, ' ')).join(', ')}. For kitesurf: ${bestKite.slice(0, 3).map(s => s.id.replace(/-/g, ' ')).join(', ')}.`,
    category: 'general',
    source: 'VenTu AI',
    url: 'https://ventu.surf',
    publishedAt: new Date().toISOString(),
    tags: ['portugal', 'resumo', 'condicoes'],
  });
  
  console.log(`✅ Generated ${news.length} static news items`);
  return news;
}

/**
 * Generate fallback news from RSS or static content
 */
async function generateFallbackNews() {
  // Try RSS feeds
  const allArticles = [];
  for (const feed of RSS_FEEDS) {
    const articles = await fetchRSSFeed(feed);
    if (articles) allArticles.push(...articles);
  }

  if (allArticles.length > 0) {
    console.log(`📰 Using ${allArticles.length} RSS articles as fallback`);
    
    return allArticles.slice(0, 6).map((a, i) => ({
      id: `news-${Date.now()}-${i}`,
      title: a.title,
      titleEn: a.title,
      summary: a.description.substring(0, 200),
      summaryEn: a.description.substring(0, 200),
      category: categorizeNews(a.title),
      source: a.source,
      url: a.url,
      publishedAt: a.publishedAt,
      tags: extractTags(a.title + ' ' + a.description),
    }));
  }
  
  return [];
}

function categorizeNews(title) {
  const lower = title.toLowerCase();
  if (lower.includes('competition') || lower.includes('wsl') || lower.includes('championship') || lower.includes('tour')) {
    return 'competition';
  }
  if (lower.includes('kitesurf') || lower.includes('kite')) return 'kitesurf';
  if (lower.includes('windsurf') || lower.includes('wind')) return 'windsurf';
  if (lower.includes('surf') && !lower.includes('kitesurf') && !lower.includes('windsurf')) return 'surf';
  if (lower.includes('safety') || lower.includes('alert') || lower.includes('warning')) return 'safety';
  return 'general';
}

function extractTags(text) {
  const tags = [];
  const lower = text.toLowerCase();
  
  const tagMap = {
    'nazare': 'nazare', 'peniche': 'peniche', 'supertubos': 'supertubos',
    'guincho': 'guincho', 'cascais': 'cascais', 'ericeira': 'ericeira',
    'algarve': 'algarve', 'sagres': 'sagres', 'porto': 'porto',
    'foz': 'foz', 'baleal': 'baleal', 'costa': 'costa',
    'wsl': 'wsl', 'big-wave': 'big-wave', 'tow': 'tow',
    'kitesurf': 'kitesurf', 'windsurf': 'windsurf', 'surf': 'surf',
    'wave': 'wave', 'wind': 'wind', 'swell': 'swell',
  };
  
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (lower.includes(keyword)) tags.push(tag);
  }
  
  return [...new Set(tags)].slice(0, 5);
}

async function updateNews() {
  console.log('📰 VenTu - Updating news...');
  console.log('🔑 LLM providers configured:', require('./llm-fallback').getAvailableProviders().map(p => p.name).join(', ') || 'NONE');

  // Load conditions data
  const conditions = loadConditions();
  let newsItems = [];

  if (Object.keys(conditions).length > 0) {
    console.log(`📊 Loaded conditions for ${Object.keys(conditions).length} spots`);
    
    // Find best spots
    const spotData = findBestSpots(conditions);
    console.log(`🏄 Best surf: ${spotData.bestSurf.map(s => s.id).join(', ')}`);
    console.log(`🪁 Best kite: ${spotData.bestKite.map(s => s.id).join(', ')}`);
    
    // Generate briefing with Gemini
    const briefing = await generateDailyBriefing(spotData);
    if (briefing && briefing.length > 0) {
      newsItems = briefing;
      console.log(`✅ Generated ${briefing.length} AI news items`);
    } else {
      console.log('⚠️ Gemini returned no news items');
    }
  } else {
    console.log('⚠️ No conditions data found');
  }

  // If Gemini failed or no conditions, try RSS fallback
  if (newsItems.length === 0) {
    console.log('🔄 Trying RSS fallback...');
    const fallback = await generateFallbackNews();
    if (fallback.length > 0) {
      newsItems = fallback;
    }
  }

  // Save news (even if empty - for debugging)
  const outputPath = path.join(__dirname, '../public/data/news.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(newsItems, null, 2));

  console.log(`\n✅ News saved to ${outputPath}`);
  console.log(`📰 ${newsItems.length} news items`);
  
  if (newsItems.length === 0) {
    console.log('⚠️ WARNING: No news items generated!');
  }
  
  newsItems.forEach((item, i) => {
    console.log(`\n  ${i + 1}. [${item.category.toUpperCase()}] ${item.title}`);
    console.log(`     ${item.summary.substring(0, 80)}...`);
    console.log(`     Source: ${item.source}`);
  });
}

updateNews().catch(e => {
  console.error('❌ Fatal error in update-news.js:', e);
  process.exit(1);
});
