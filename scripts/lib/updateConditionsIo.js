function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createUsageCounter() {
  return {
    weightedCalls: 0,
    requests: 0,
    retries: 0,
    spotsFetched: 0,
    record(weight = 1) {
      this.requests += 1;
      this.weightedCalls += weight;
    },
  };
}

async function fetchWithRetry(url, retries = 3, delay = 1000, usage, weight = 1) {
  for (let i = 0; i < retries; i += 1) {
    try {
      usage?.record(weight);
      const response = await fetch(url);
      if (response.ok) return response.json();
      if (response.status === 429) {
        if (usage) usage.retries += 1;
        console.log(`  ⏳ Rate limited, waiting ${delay * (i + 1)}ms...`);
        await sleep(delay * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      if (usage) usage.retries += 1;
      await sleep(delay * (i + 1));
    }
  }
  throw new Error('Max retries exceeded');
}

module.exports = { sleep, createUsageCounter, fetchWithRetry };
