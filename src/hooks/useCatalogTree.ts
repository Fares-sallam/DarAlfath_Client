import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProducts } from '@/hooks/useStorefront';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { CatalogNode, ProductLink } from '@/lib/catalogTree';
import type { NodeAlias } from '@/lib/nodeAliases';
import type { MenuItem } from '@/lib/menuMap';
import type { HomeLayoutRow } from '@/lib/homeBlocks';
import { usePreview } from '@/lib/homePreview';
import { SHELF_KIND } from '@/lib/homeShelves';
import { bookCounts, buildHomeShelves, type HomeShelfView } from '@/lib/webCatalog';

/**
 * The catalog tree the dashboard manages («السلاسل والتصنيفات»): sections, series, categories and collections,
 * and which books sit in which. The database already hides what is switched off or outside its dates; the
 * ones switched off for the website are dropped here. Every read answers "nothing" on a failure, so a page
 * that can fall back to the older lists simply does.
 */

const PAGE = 1000;

/** Reads a whole table in pages (the API caps one answer at 1000 rows). */
async function readAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error || !data) return null;
    rows.push(...(data as unknown as T[]));
    if (data.length < PAGE) return rows;
  }
}

/** The nodes the website may show, in no particular order (use childrenOf(…, 'web') to order them). */
export function useCatalogNodes() {
  return useQuery({
    queryKey: ['catalog-nodes-web'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CatalogNode[]> => {
      if (!isSupabaseConfigured) return [];
      const rows = await readAll<CatalogNode>('catalog_nodes', '*');
      return (rows ?? []).filter((node) => node.show_web);
    },
  });
}

/** The old addresses of items that were merged into another one (see lib/nodeAliases): usually a handful of rows, often none. */
export function useNodeAliases() {
  return useQuery({
    queryKey: ['catalog-node-aliases'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NodeAlias[]> => {
      if (!isSupabaseConfigured) return [];
      return (await readAll<NodeAlias>('catalog_node_aliases', 'old_id, old_slug, node_id')) ?? [];
    },
  });
}

/** Which book sits in which node (only the direct links; "everything under a node" is worked out from the tree). */
export function useProductNodeLinks() {
  return useQuery({
    queryKey: ['catalog-product-links'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductLink[]> => {
      if (!isSupabaseConfigured) return [];
      return (await readAll<ProductLink>('product_nodes', 'product_id, node_id, is_primary, sort_order')) ?? [];
    },
  });
}

/**
 * The cards of «أقسام المتجر», as the dashboard's tab of that name chose them: the ids of existing nodes, in order. `null` = the
 * list can't be read (then the home page draws every series, as it did before the list existed).
 */
export function useDepartmentCards() {
  return useQuery({
    queryKey: ['store-departments-web'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[] | null> => {
      if (!isSupabaseConfigured) return null;
      const { data, error } = await supabase.from('store_departments').select('node_id, sort_order').order('sort_order', { ascending: true });
      if (error || !data) return null;
      return (data as { node_id: string }[]).map((row) => row.node_id);
    },
  });
}

/** The website's top menu rows (the dashboard's «خريطة العرض»). Empty = draw the older menu. */
export function useWebMenuItems() {
  return useQuery({
    queryKey: ['menu-items-web'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MenuItem[]> => {
      if (!isSupabaseConfigured) return [];
      return (await readAll<MenuItem>('menu_items', '*', (q) => q.eq('channel', 'web'))) ?? [];
    },
  });
}

/**
 * Everything the website's lists need from the tree in one go: the nodes it may show, the book links, the books the
 * visitor's country sees, and how many each node holds. `hasTree` is false when the tree can't be read or is empty:
 * the lists then use the older tables.
 */
export function useWebTree() {
  const nodesQuery = useCatalogNodes();
  const linksQuery = useProductNodeLinks();
  const productsQuery = useProducts();
  const nodes = nodesQuery.data;
  const links = linksQuery.data;
  const products = productsQuery.data;
  const counts = useMemo(() => bookCounts(nodes ?? [], links ?? [], products ?? []), [nodes, links, products]);
  return {
    nodes: nodes ?? [],
    links: links ?? [],
    products: products ?? [],
    counts,
    loading: nodesQuery.isLoading || linksQuery.isLoading || productsQuery.isLoading,
    hasTree: (nodes?.length ?? 0) > 0,
  };
}

/** Every saved row of the website's home page layout: the blocks, the category shelves and the other pages' strips. */
export function useHomeLayoutRows() {
  // on the dashboard's preview page the rows being edited replace the saved ones
  const preview = usePreview();
  const query = useQuery({
    queryKey: ['home-layout-rows'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HomeLayoutRow[]> => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from('home_layout')
        .select('section_key, kind, node_id, title_ar, subtitle_ar, item_limit, visible, sort_order, starts_at, ends_at, countries, devices, config')
        .eq('channel', 'web');
      if (error || !data) return [];
      return data as HomeLayoutRow[];
    },
  });
  return preview.rows ? ({ ...query, data: preview.rows, isLoading: false } as typeof query) : query;
}

/**
 * The home page's category shelves as chosen in the dashboard, or null when none were chosen (or the tree can't be read):
 * the page then draws its first three categories, as it always did. `loading` is true until it is known which.
 */
export function useHomeShelfSections(): { loading: boolean; shelves: HomeShelfView[] | null } {
  const rowsQuery = useHomeLayoutRows();
  const tree = useWebTree();
  const shelfRows = useMemo(() => (rowsQuery.data ?? []).filter((r) => r.kind === SHELF_KIND), [rowsQuery.data]);
  const shelves = useMemo(
    () => (shelfRows.length > 0 && tree.hasTree ? buildHomeShelves(shelfRows, tree.nodes, tree.links, tree.products) : null),
    [shelfRows, tree.hasTree, tree.nodes, tree.links, tree.products],
  );
  return { loading: rowsQuery.isLoading || tree.loading, shelves };
}
