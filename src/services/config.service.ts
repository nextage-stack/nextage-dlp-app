// Loads DLP config from Azure Functions proxy. Caches in sessionStorage for 60min.

import { DLPConfig } from "../models/customer.model";
import { CacheService } from "../shared/cache";
import { API_BASE_URL, API_TIMEOUT_MS, CONFIG_CACHE_TTL_MS } from "../shared/constants";

const CACHE_KEY = "dlp:config";

export class ConfigService {
  private readonly cache = new CacheService();

  constructor(private readonly accessToken: string) {}

  async getConfig(): Promise<DLPConfig> {
    const cached = this.cache.get<DLPConfig>(CACHE_KEY);
    if (cached) {
      console.log("[Config] Cache hit");
      return cached;
    }

    console.log("[Config] Cache miss — fetching from API");
    const config = await this.fetchFromApi();
    this.cache.set(CACHE_KEY, config, CONFIG_CACHE_TTL_MS);
    return config;
  }

  /**
   * Force refresh from API, bypassing cache. Used by manual refresh button.
   */
  async refreshConfig(): Promise<DLPConfig> {
    this.cache.delete(CACHE_KEY);
    return this.getConfig();
  }

  private async fetchFromApi(): Promise<DLPConfig> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}/config`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Config API returned ${response.status}: ${response.statusText}`,
        );
      }

      const config = (await response.json()) as DLPConfig;

      // Defensive: ensure all expected fields are arrays
      return {
        customers: Array.isArray(config.customers) ? config.customers : [],
        advisors: Array.isArray(config.advisors) ? config.advisors : [],
        exemptions: Array.isArray(config.exemptions) ? config.exemptions : [],
        exclusions: Array.isArray(config.exclusions) ? config.exclusions : [],
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
