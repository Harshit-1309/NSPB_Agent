import { getMember } from '../tools/getMember.js';
import logger from './logger.js';

/**
 * Service to resolve technical member names to their Oracle aliases.
 */
export class AliasResolver {
  private cache: Map<string, string> = new Map();

  /**
   * Resolves a list of members to their aliases using the Get Member tool.
   */
  async resolveAliases(dimName: string, memberNames: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    const uniqueMembers = [...new Set(memberNames)].filter(n => n && typeof n === 'string');
    if (uniqueMembers.length === 0) return {};

    logger.info(`Resolving aliases for ${uniqueMembers.length} members in ${dimName}...`);

    // 1. Batch Optimization: If many members, fetch the whole dimension once
    if (uniqueMembers.length > 3) {
      try {
        const planType = 'NSP_NFS';
        const response = await (await import('../services/oracleClient.js')).default.get(`/plantypes/${planType}/dimensions/${encodeURIComponent(dimName)}`);
        
        const traverse = (node: any) => {
          if (node.name && node.alias) {
            this.cache.set(`${dimName}:${node.name}`, node.alias);
          }
          if (node.children) node.children.forEach(traverse);
        };

        if (response.data) {
          traverse(response.data);
          logger.info(`Batch-loaded aliases for ${dimName} via plan type`);
        }
      } catch (err) {
        logger.warn(`Batch alias fetch failed for ${dimName}, trying standard path...`);
        try {
          const response = await (await import('../services/oracleClient.js')).default.get(`/dimensions/${encodeURIComponent(dimName)}/members`);
          if (response.data && response.data.items) {
            response.data.items.forEach((item: any) => {
              if (item.name && item.alias) {
                this.cache.set(`${dimName}:${item.name}`, item.alias);
              }
            });
            logger.info(`Batch-loaded aliases for ${dimName} via standard path`);
          }
        } catch (e) {
          logger.warn(`Individual fallback for ${dimName} will be used.`);
        }
      }
    }

    const lookups = uniqueMembers.map(async (name) => {
      // 1. Check cache first (includes results from batch load above)
      const cacheKey = `${dimName}:${name}`;
      if (this.cache.has(cacheKey)) {
        return { name, alias: this.cache.get(cacheKey)! };
      }

      // 2. Optimization: If it's a known TP code, use the fast path
      const tpMatch = name.match(/^TP(\d+)$/);
      if (tpMatch) {
        const tpNum = parseInt(tpMatch[1]);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        if (tpNum >= 1 && tpNum <= 12) {
          const alias = months[tpNum - 1];
          this.cache.set(cacheKey, alias);
          return { name, alias };
        }
      }

      // 3. Fallback to Metadata API for other members
      try {
        const response = await getMember({ dimName, memberName: name });
        if (response.success && response.data && 'alias' in response.data) {
          const alias = response.data.alias as string;
          this.cache.set(cacheKey, alias);
          return { name, alias };
        }
      } catch (err) {}

      return { name, alias: name };
    });

    const resolved = await Promise.all(lookups);
    resolved.forEach(item => {
      results[item.name] = item.alias;
    });

    return results;
  }
}

export const aliasResolver = new AliasResolver();
