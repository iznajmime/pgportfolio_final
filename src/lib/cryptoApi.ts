// src/lib/cryptoApi.ts

// --- TYPE DEFINITIONS ---
type PriceData = {
  usd: number;
  usd_24h_change: number;
};

type PriceResult = Record<string, PriceData>;

// --- CONFIG ---
// A map to convert our app's symbols to CoinGecko's required IDs.
// Exported so it can be used elsewhere (e.g., for historical lookups)
export const SYMBOL_TO_GECKO_ID_MAP: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'SUI': 'sui',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
};

// --- API FUNCTIONS ---

/**
 * Fetches current cryptocurrency prices from the CoinGecko /simple/price endpoint.
 * @param assetSymbols An array of asset symbols (e.g., ['BTC', 'ETH', 'SUI']).
 * @returns A promise that resolves to a record mapping symbols to their price data.
 */
export const fetchCryptoPrices = async (assetSymbols: string[]): Promise<PriceResult> => {
  const finalPrices: PriceResult = {};
  
  const uniqueSymbols = [...new Set(assetSymbols)];
  if (uniqueSymbols.length === 0) {
    return finalPrices;
  }

  const coingeckoIds = uniqueSymbols
    .map(symbol => SYMBOL_TO_GECKO_ID_MAP[symbol.toUpperCase()])
    .filter(id => id);

  if (coingeckoIds.length === 0) {
    console.warn("Could not find any matching CoinGecko IDs for the requested symbols:", uniqueSymbols);
    return finalPrices;
  }
  
  const idsParam = coingeckoIds.join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd&include_24hr_change=true`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko API request failed: ${response.statusText}`);
    }
    const data = await response.json();

    const idToSymbolMap: Record<string, string> = {};
    for (const symbol in SYMBOL_TO_GECKO_ID_MAP) {
      idToSymbolMap[SYMBOL_TO_GECKO_ID_MAP[symbol]] = symbol;
    }

    for (const id in data) {
      const originalSymbol = idToSymbolMap[id];
      if (originalSymbol && data[id].usd) {
        finalPrices[originalSymbol] = {
          usd: data[id].usd,
          usd_24h_change: data[id].usd_24h_change || 0,
        };
      }
    }
  } catch (error) {
    console.error("Error fetching prices from CoinGecko:", error);
    return {};
  }

  console.log("Final prices fetched:", finalPrices);
  return finalPrices;
};

/**
 * Fetches the historical price of a single cryptocurrency from CoinGecko.
 * @param coingeckoId The CoinGecko ID of the asset (e.g., 'bitcoin').
 * @param date The date in 'dd-mm-yyyy' format.
 * @returns A promise that resolves to the historical price in USD, or null if not found.
 */
export const fetchHistoricalPrice = async (coingeckoId: string, date: string): Promise<number | null> => {
  if (!coingeckoId) {
    console.warn("fetchHistoricalPrice called with no coingeckoId.");
    return null;
  }
  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/history?date=${date}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Could not fetch historical price for ${coingeckoId} on ${date}. Status: ${response.statusText}`);
      return null;
    }
    const data = await response.json();

    if (data?.market_data?.current_price?.usd) {
      return data.market_data.current_price.usd;
    } else {
      // This can happen if the coin existed but has no market data for that specific day.
      console.warn(`No historical price data found in response for ${coingeckoId} on ${date}.`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching historical price for ${coingeckoId}:`, error);
    return null;
  }
};
