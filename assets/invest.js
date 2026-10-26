// Recupero prezzi in tempo reale: criptovalute (CoinGecko, nessuna chiave richiesta)
// e azioni/ETF (Twelve Data, richiede una chiave API gratuita).
const InvestAPI = (() => {
  const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
  const TWELVEDATA_BASE = 'https://api.twelvedata.com';

  const COMMON_COINS = [
    { id: 'bitcoin', label: 'Bitcoin (BTC)' },
    { id: 'ethereum', label: 'Ethereum (ETH)' },
    { id: 'tether', label: 'Tether (USDT)' },
    { id: 'binancecoin', label: 'BNB' },
    { id: 'solana', label: 'Solana (SOL)' },
    { id: 'ripple', label: 'XRP' },
    { id: 'usd-coin', label: 'USD Coin (USDC)' },
    { id: 'cardano', label: 'Cardano (ADA)' },
    { id: 'dogecoin', label: 'Dogecoin (DOGE)' },
    { id: 'tron', label: 'TRON (TRX)' },
    { id: 'avalanche-2', label: 'Avalanche (AVAX)' },
    { id: 'polkadot', label: 'Polkadot (DOT)' },
    { id: 'chainlink', label: 'Chainlink (LINK)' },
    { id: 'litecoin', label: 'Litecoin (LTC)' },
    { id: 'matic-network', label: 'Polygon (MATIC)' },
  ];

  async function fetchCryptoPrices(coinIds) {
    if (!coinIds || coinIds.length === 0) return {};
    const ids = [...new Set(coinIds)].join(',');
    const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=eur&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Errore nel recupero prezzi crypto (CoinGecko).');
    const data = await res.json();
    const result = {};
    coinIds.forEach((id) => {
      if (data[id]) {
        result[id] = { price: data[id].eur, changePct: data[id].eur_24h_change };
      }
    });
    return result;
  }

  async function fetchStockQuotes(symbols, apiKey) {
    if (!symbols || symbols.length === 0) return {};
    if (!apiKey) throw new Error('Inserisci una chiave API Twelve Data nelle impostazioni per vedere le quotazioni.');
    const uniqueSymbols = [...new Set(symbols)];
    const url = `${TWELVEDATA_BASE}/quote?symbol=${encodeURIComponent(uniqueSymbols.join(','))}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Errore nel recupero quotazioni (Twelve Data).');
    const data = await res.json();
    const result = {};

    if (uniqueSymbols.length === 1) {
      if (data.code || data.status === 'error') {
        throw new Error(data.message || 'Simbolo non valido.');
      }
      result[uniqueSymbols[0]] = {
        price: Number(data.close),
        changePct: Number(data.percent_change),
        name: data.name,
      };
    } else {
      uniqueSymbols.forEach((sym) => {
        const entry = data[sym];
        if (entry && !entry.code) {
          result[sym] = { price: Number(entry.close), changePct: Number(entry.percent_change), name: entry.name };
        }
      });
    }
    return result;
  }

  return { fetchCryptoPrices, fetchStockQuotes, COMMON_COINS };
})();
