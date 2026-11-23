/**
 * VenTu — Saúde do feed de notícias por região
 *
 * O pipeline pode ficar verde com a página nacional vazia: em 2026-11-15 as
 * três fontes pt pararam de publicar e a TTL de 7 dias apagou o que restava,
 * sem que nada falhasse. Este módulo conta os itens finais por `sourceRegion`,
 * emite `::warning::` quando não há nenhum `pt` e mantém uma issue única
 * («Notícias: feed sem itens pt») aberta — comenta quando o feed continua
 * vazio, comenta que recuperou quando volta a haver itens, e nunca duplica a
 * issue nem a fecha automaticamente.
 *
 * Não falha o job: qualquer erro da API do GitHub é só um aviso no log.
 */

const ISSUE_TITLE = 'Notícias: feed sem itens pt';
const API_BASE = 'https://api.github.com';

/**
 * Conta itens por região. `sourceRegion` ausente conta como `intl`, a mesma
 * regra do filtro do site (`item.sourceRegion ?? 'intl'` em src/lib/news.ts).
 * @param {Array<{ sourceRegion?: string }>} items
 * @returns {{ pt: number, intl: number }}
 */
function regionCounts(items) {
  const counts = { pt: 0, intl: 0 };
  for (const item of items || []) {
    if (item && item.sourceRegion === 'pt') counts.pt += 1;
    else counts.intl += 1;
  }
  return counts;
}

/** «pt=0, intl=50» */
function formatCounts(counts) {
  return `pt=${counts.pt}, intl=${counts.intl}`;
}

/**
 * O que fazer com a issue, dados os itens finais e a issue aberta (se houver).
 *  - pt > 0 e issue aberta  → 'comment-recovered' (comenta, não fecha)
 *  - pt > 0 e sem issue     → 'none'
 *  - pt = 0 e issue aberta  → 'comment-empty' (nunca duplica)
 *  - pt = 0 e sem issue     → 'open'
 * @param {{ ptCount: number, issueNumber?: number|null }} input
 * @returns {'open'|'comment-empty'|'comment-recovered'|'none'}
 */
function decideFeedHealthAction({ ptCount, issueNumber }) {
  if (ptCount > 0) return issueNumber ? 'comment-recovered' : 'none';
  return issueNumber ? 'comment-empty' : 'open';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function githubRequest(path, { token, method = 'GET', body, fetchImpl }) {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ${method} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Procura a issue aberta com o título fixo. Ignora pull requests (a API de
 * issues devolve-as na mesma lista).
 */
async function findOpenIssue({ token, repo, fetchImpl }) {
  const issues = await githubRequest(`/repos/${repo}/issues?state=open&per_page=100`, { token, fetchImpl });
  if (!Array.isArray(issues)) return null;
  return issues.find((issue) => issue && !issue.pull_request && issue.title === ISSUE_TITLE) || null;
}

/**
 * Conta por região, emite o aviso do Actions e mantém a issue em dia.
 *
 * @param {{
 *   items: Array<{ sourceRegion?: string }>,
 *   token?: string,
 *   repo?: string,
 *   fetchImpl?: typeof fetch,
 *   log?: (...args: unknown[]) => void,
 * }} input
 * @returns {Promise<{ action: string, counts: { pt: number, intl: number }, issueNumber?: number|null, skipped?: boolean }>}
 */
async function reportFeedHealth({
  items,
  token = process.env.GITHUB_TOKEN,
  repo = process.env.GITHUB_REPOSITORY,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const counts = regionCounts(items);
  log(`📊 Feed final por região: ${formatCounts(counts)}`);

  if (counts.pt === 0) {
    log(
      `::warning::Notícias: feed sem itens pt (${formatCounts(counts)}) — ` +
        'as fontes nacionais não estão a entregar itens há mais tempo do que a TTL de 7 dias.',
    );
  }

  if (!token || !repo) {
    log('   → GitHub API indisponível (sem GITHUB_TOKEN/GITHUB_REPOSITORY): não mexo na issue.');
    return { action: 'none', counts, skipped: true };
  }

  try {
    const issue = await findOpenIssue({ token, repo, fetchImpl });
    const action = decideFeedHealthAction({ ptCount: counts.pt, issueNumber: issue && issue.number });
    const when = todayIso();

    if (action === 'open') {
      const created = await githubRequest(`/repos/${repo}/issues`, {
        token,
        method: 'POST',
        fetchImpl,
        body: {
          title: ISSUE_TITLE,
          body:
            `O feed de notícias não tem nenhum item \`sourceRegion: 'pt'\` — ` +
            `a página nacional (\`/pt/news/\`) fica sem notícias.\n\n` +
            `- Contagem actual: ${formatCounts(counts)} (${when})\n` +
            `- A TTL de 7 dias apaga os itens antigos; quando as fontes pt não publicam, o feed pt chega a zero.\n` +
            `- Fontes pt configuradas: ANS, Notícias do Mar, FPS, Surftotal (\`scripts/news/fetch-rss.js\`).\n\n` +
            'Aberto automaticamente pelo pipeline de notícias. Esta issue não é fechada sozinha: ' +
            'quando o feed recuperar, o pipeline comenta aqui.',
        },
      });
      log(`   → Issue aberta: #${created.number} (${ISSUE_TITLE})`);
      return { action, counts, issueNumber: created.number };
    }

    if (action === 'comment-empty') {
      await githubRequest(`/repos/${repo}/issues/${issue.number}/comments`, {
        token,
        method: 'POST',
        fetchImpl,
        body: { body: `Continua sem itens pt — ${formatCounts(counts)} (${when}).` },
      });
      log(`   → Comentário na issue #${issue.number}: feed continua sem itens pt.`);
      return { action, counts, issueNumber: issue.number };
    }

    if (action === 'comment-recovered') {
      await githubRequest(`/repos/${repo}/issues/${issue.number}/comments`, {
        token,
        method: 'POST',
        fetchImpl,
        body: {
          body: `O feed voltou a ter itens pt — ${formatCounts(counts)} (${when}). Issue mantida aberta.`,
        },
      });
      log(`   → Comentário na issue #${issue.number}: feed pt recuperou.`);
      return { action, counts, issueNumber: issue.number };
    }

    log('   → Feed pt com itens e sem issue aberta: nada a fazer.');
    return { action, counts, issueNumber: null };
  } catch (e) {
    log(`   ⚠️ Saúde do feed: não consegui falar com a API do GitHub — ${e.message}`);
    return { action: 'error', counts };
  }
}

module.exports = {
  ISSUE_TITLE,
  regionCounts,
  formatCounts,
  decideFeedHealthAction,
  reportFeedHealth,
};
