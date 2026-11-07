import { buildSearchQuery, toUsd, type CardIdentification, type Comparable, type ProviderEstimate } from "@kort/shared";
import { fold, quantile, trim } from "./stats";
import type { PriceContext, PriceProvider } from "./types";

/** eBay category "Sports Trading Card Singles". */
export const EBAY_CATEGORY_SPORTS_SINGLES = "261328";

/** Asking prices are higher than what cards actually sell for. */
const ASKING_TO_SOLD = 0.85;
const MIN_LISTINGS = 3;

interface EbayItemSummary {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  itemWebUrl?: string;
  itemCreationDate?: string;
}

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  marketplace: string;
}

const GRADED_PATTERN = /\b(psa|bgs|sgc|cgc|beckett)\s*\d/i;

/** Keeps listings whose title matches the identified card closely enough. */
export function filterListings(items: EbayItemSummary[], card: CardIdentification): EbayItemSummary[] {
  const lastName = card.player ? fold(card.player.replace(/\(.*?\)/g, "").trim().split(/\s+/).pop() ?? "") : null;
  return items.filter((item) => {
    const title = fold(item.title ?? "");
    if (!title || !item.price?.value) return false;
    if (/\b(lot|bundle|pick|choose|you pick|set of|x\d+)\b/i.test(title)) return false;
    if (lastName && lastName.length > 1 && !title.includes(lastName)) return false;
    const graded = GRADED_PATTERN.test(title);
    if (card.grading.isGraded) {
      const company = fold(card.grading.company ?? "");
      if (!graded || (company && !title.includes(company))) return false;
      if (card.grading.grade != null && !new RegExp(`\\b${String(card.grading.grade).replace(".", "\\.")}\\b`).test(title)) return false;
    } else if (graded) {
      return false;
    }
    if (card.printRun && !title.includes(`/${card.printRun}`)) return false;
    if (card.isAutograph && !/auto|signed|signature/.test(title)) return false;
    return true;
  });
}

/**
 * eBay Browse API – searches active "Buy it now" listings. The official API does not
 * expose sold prices (that requires the restricted Marketplace Insights API), so
 * asking prices are discounted and the source gets medium confidence.
 */
export class EbayBrowseProvider implements PriceProvider {
  readonly id = "ebay_active" as const;
  readonly timeoutMs = 15_000;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: EbayConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const response = await this.fetchImpl("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }).toString(),
    });
    if (!response.ok) throw new Error(`eBay OAuth misslyckades (HTTP ${response.status})`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return body.access_token;
  }

  async estimate({ identification, rates }: PriceContext): Promise<ProviderEstimate | null> {
    if (!identification.player) return null;
    const query = (identification.searchQuery || buildSearchQuery(identification)).slice(0, 100);
    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("q", query);
    url.searchParams.set("category_ids", EBAY_CATEGORY_SPORTS_SINGLES);
    url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
    url.searchParams.set("limit", "50");

    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "X-EBAY-C-MARKETPLACE-ID": this.config.marketplace,
      },
    });
    if (!response.ok) throw new Error(`eBay-sökning misslyckades (HTTP ${response.status})`);
    const body = (await response.json()) as { itemSummaries?: EbayItemSummary[] };

    const listings = filterListings(body.itemSummaries ?? [], identification)
      .map((item) => ({ item, usd: toUsd(Number(item.price!.value), item.price!.currency ?? "USD", rates) }))
      .filter((x): x is { item: EbayItemSummary; usd: number } => x.usd != null && x.usd > 0);

    if (listings.length < MIN_LISTINGS) return null;

    const prices = trim(listings.map((l) => l.usd)).sort((a, b) => a - b);
    const median = quantile(prices, 0.5);
    const mid = median * ASKING_TO_SOLD;
    const low = quantile(prices, 0.25) * ASKING_TO_SOLD;
    const high = quantile(prices, 0.75) * ASKING_TO_SOLD;

    const comparables: Comparable[] = [...listings]
      .sort((a, b) => Math.abs(a.usd - median) - Math.abs(b.usd - median))
      .slice(0, 5)
      .map(({ item }) => ({
        title: item.title!,
        price: Number(item.price!.value),
        currency: item.price!.currency ?? "USD",
        url: item.itemWebUrl ?? null,
        date: item.itemCreationDate?.slice(0, 10) ?? null,
        kind: "active",
        source: "eBay",
      }));

    return {
      provider: this.id,
      label: "eBay – aktiva annonser",
      low,
      mid,
      high,
      confidence: Math.min(0.55, 0.35 + listings.length / 100),
      comparables,
      note: `${listings.length} matchande annonser på eBay (sökning: "${query}"). Utropspriser är omräknade med −15 % eftersom kort normalt säljs under utropspris.`,
    };
  }
}
