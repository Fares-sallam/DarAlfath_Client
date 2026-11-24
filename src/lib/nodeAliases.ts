// When two catalog items are merged in the dashboard, the one that went away keeps an alias that points at the one that stayed.
// An old link (a shared address, a bookmark, a search result) still carries the old category slug or the old series / node id:
// this works out what the address should say now. Pure; no React, no network.
import type { CatalogNode } from './catalogTree';

export interface NodeAlias {
  old_id: string;
  old_slug: string | null;
  node_id: string;
}

/**
 * The address changes that send an old link to the item it was merged into (empty = nothing to change). Only an address that
 * matches no live item is touched, and only when an alias knows it.
 */
export function aliasRedirect(
  params: { category: string; series: string; node: string },
  nodes: readonly CatalogNode[],
  aliases: readonly NodeAlias[],
): Record<string, string> {
  if (nodes.length === 0 || aliases.length === 0) return {};
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const bySlug = new Set(nodes.map((n) => n.slug));
  const targetOf = (alias: NodeAlias | undefined) => (alias ? byId.get(alias.node_id) ?? null : null);
  const changes: Record<string, string> = {};

  if (params.node && !byId.has(params.node)) {
    const target = targetOf(aliases.find((a) => a.old_id === params.node));
    if (target) changes.node = target.id;
  }

  if (params.series && !byId.has(params.series)) {
    const target = targetOf(aliases.find((a) => a.old_id === params.series));
    if (target) {
      if (target.type === 'series') changes.series = target.id;
      else { changes.series = ''; changes.node = target.id; }
    }
  }

  if (params.category && !byId.has(params.category) && !bySlug.has(params.category)) {
    const target = targetOf(aliases.find((a) => a.old_slug === params.category || a.old_id === params.category));
    if (target) {
      if (target.type === 'category' || target.type === 'collection') changes.category = target.slug;
      else { changes.category = ''; changes.node = target.id; }
    }
  }

  return changes;
}
