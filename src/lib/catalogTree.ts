// The unified catalog tree (sections, series, categories, collections): pure helpers shared by the dashboard
// pages and (from phase 3) the storefront. No React, no Supabase.

export type NodeType = 'section' | 'series' | 'category' | 'collection';
export type Channel = 'web' | 'app' | 'both';
export type BooksSort = 'manual' | 'newest' | 'title' | 'sales';
export type PageLayout = 'auto' | 'strips' | 'grid';

export const NODE_TYPES: NodeType[] = ['section', 'series', 'category', 'collection'];

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  section: 'قسم',
  series: 'سلسلة',
  category: 'تصنيف',
  collection: 'مجموعة',
};

export const NODE_TYPE_HINTS: Record<NodeType, string> = {
  section: 'مستوى أعلى يجمّع سلاسل وتصنيفات (جديد: لا يظهر في نسخ التطبيق القديمة).',
  series: 'سلسلة كتب (كروت «أقسام المتجر» في الرئيسية وقائمة الموقع).',
  category: 'تصنيف للكتب (شريط التصنيفات وفلتر الكتب).',
  collection: 'مجموعة موضوعية تتكرر عبر الكتب، تتعامل كتصنيف إضافي.',
};

export const PAGE_LAYOUT_LABELS: Record<PageLayout, string> = {
  auto: 'تلقائي (أشرطة لو فيه عناصر تحته، وإلا شبكة)',
  strips: 'أشرطة (شريط لكل عنصر تحته، بيتسحب يمين وشمال)',
  grid: 'شبكة كتب واحدة',
};

export const BOOKS_SORT_LABELS: Record<BooksSort, string> = {
  manual: 'يدوي (الترتيب اللي أحدده)',
  newest: 'الأحدث أولًا',
  title: 'أبجديًا',
  sales: 'الأكثر مبيعًا',
};

export interface CatalogNode {
  id: string;
  parent_id: string | null;
  type: NodeType;
  name_ar: string;
  name_en: string | null;
  slug: string;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  featured: boolean;
  show_web: boolean;
  show_app: boolean;
  sort_web: number;
  sort_app: number;
  show_in_menu_web: boolean;
  show_in_bar_web: boolean;
  show_in_bar_app: boolean;
  hide_when_empty: boolean;
  books_sort_web: BooksSort;
  books_sort_app: BooksSort;
  starts_at: string | null;
  ends_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  /** the welcome text and the video at the top of the node's own page */
  intro_ar: string | null;
  intro_en: string | null;
  video_url: string | null;
  /** 'auto' = a video when there is one; or say it: 'video' / 'image' / 'none' */
  intro_media: 'auto' | 'video' | 'image' | 'none';
  intro_image_url: string | null;
  /** how the welcome text is set: alignment, size in px, side spacing in px, and where it sits next to the picture or video */
  intro_align: 'right' | 'center' | 'left';
  intro_font_px: number;
  intro_pad_right: number;
  intro_pad_left: number;
  intro_text_pos: 'side' | 'above' | 'below';
  page_layout: PageLayout;
  strips_limit: number;
  /** shown as a strip on its parent's page */
  show_as_strip: boolean;
  legacy_table: 'book_series' | 'categories' | null;
  legacy_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductLink {
  product_id: string;
  node_id: string;
  is_primary: boolean;
  sort_order: number;
  pinned?: boolean;
}

export interface NodeCounts {
  direct: number;
  total: number;
}

export interface TreeRow {
  node: CatalogNode;
  depth: number;
  hasChildren: boolean;
  /** names from the root down to this node's parent */
  path: string[];
}

/** The order a node has in a channel ("both" shows the website's order). */
export function sortOf(node: CatalogNode, channel: Channel): number {
  return channel === 'app' ? node.sort_app : node.sort_web;
}

function compareNodes(channel: Channel) {
  return (a: CatalogNode, b: CatalogNode) =>
    sortOf(a, channel) - sortOf(b, channel) || a.name_ar.localeCompare(b.name_ar, 'ar') || a.id.localeCompare(b.id);
}

/** Children of a node (or the roots for null), in a channel's order. */
export function childrenOf(nodes: readonly CatalogNode[], parentId: string | null, channel: Channel): CatalogNode[] {
  return nodes.filter((n) => n.parent_id === parentId).sort(compareNodes(channel));
}

/** A node and everything under it. */
export function descendantIds(nodes: readonly CatalogNode[], id: string): Set<string> {
  const byParent = new Map<string | null, CatalogNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parent_id) ?? [];
    list.push(n);
    byParent.set(n.parent_id, list);
  }
  const out = new Set<string>();
  const walk = (current: string) => {
    for (const child of byParent.get(current) ?? []) {
      if (out.has(child.id)) continue; // never loop on bad data
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** From the root down to (not including) the node. */
export function ancestorsOf(nodes: readonly CatalogNode[], id: string): CatalogNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: CatalogNode[] = [];
  const seen = new Set<string>([id]);
  let cursor = byId.get(id)?.parent_id ?? null;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) break;
    out.unshift(parent);
    cursor = parent.parent_id;
  }
  return out;
}

/** Where a node may be placed: anywhere except under itself or its own descendants. */
export function allowedParents(nodes: readonly CatalogNode[], id: string | null): CatalogNode[] {
  if (!id) return [...nodes];
  const blocked = descendantIds(nodes, id);
  blocked.add(id);
  return nodes.filter((n) => !blocked.has(n.id));
}

/** The tree as visible rows. With a query: matches and their parents, all open. */
export function buildTree(
  nodes: readonly CatalogNode[],
  channel: Channel,
  expanded: ReadonlySet<string>,
  query = '',
): TreeRow[] {
  const q = query.trim().toLowerCase();
  const byParent = new Map<string | null, CatalogNode[]>();
  const known = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    // a node whose parent is unknown (not readable) is shown as a root
    const key = n.parent_id && known.has(n.parent_id) ? n.parent_id : null;
    const list = byParent.get(key) ?? [];
    list.push(n);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) list.sort(compareNodes(channel));

  const matches = new Set<string>();
  if (q) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      const text = `${n.name_ar} ${n.name_en ?? ''} ${n.slug}`.toLowerCase();
      if (!text.includes(q)) continue;
      let cursor: CatalogNode | undefined = n;
      const guard = new Set<string>();
      while (cursor && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        matches.add(cursor.id);
        cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
      }
    }
  }

  const rows: TreeRow[] = [];
  const walk = (parent: string | null, depth: number, path: string[]) => {
    for (const node of byParent.get(parent) ?? []) {
      if (q && !matches.has(node.id)) continue;
      const kids = (byParent.get(node.id) ?? []).filter((k) => !q || matches.has(k.id));
      rows.push({ node, depth, hasChildren: kids.length > 0, path });
      if (kids.length > 0 && (q || expanded.has(node.id))) walk(node.id, depth + 1, [...path, node.name_ar]);
    }
  };
  walk(null, 0, []);
  return rows;
}

/** The sibling ids after moving one step (-1 up, 1 down), or null when it cannot move. */
export function moveWithinSiblings(siblings: readonly CatalogNode[], id: string, direction: -1 | 1): string[] | null {
  const index = siblings.findIndex((n) => n.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return null;
  const ids = siblings.map((n) => n.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

/** The order for a new node of a type: after every existing node of the same family (series strip / category bar). */
export function nextSortFor(nodes: readonly CatalogNode[], type: NodeType, channel: 'web' | 'app'): number {
  const family = (t: NodeType) => (t === 'series' ? 'series' : t === 'section' ? 'section' : 'category');
  const values = nodes.filter((n) => family(n.type) === family(type)).map((n) => (channel === 'app' ? n.sort_app : n.sort_web));
  return values.length === 0 ? 0 : Math.max(...values) + 1;
}

/** Same rule as the database's catalog_slugify(): lower-case, letters and digits (Arabic included), dashes between. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ء-ي٠-٩]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type NodeStatus = 'visible' | 'hidden' | 'scheduled' | 'expired';

export function nodeStatus(node: CatalogNode, now: Date = new Date()): NodeStatus {
  if (!node.is_active) return 'hidden';
  if (node.starts_at && new Date(node.starts_at) > now) return 'scheduled';
  if (node.ends_at && new Date(node.ends_at) <= now) return 'expired';
  return 'visible';
}

export const STATUS_LABELS: Record<NodeStatus, string> = {
  visible: 'ظاهر',
  hidden: 'مخفي',
  scheduled: 'مجدول',
  expired: 'منتهي',
};

/** The short flags shown beside a node in the tree. */
export function nodeFlags(node: CatalogNode): string[] {
  const flags: string[] = [];
  if (node.featured) flags.push('مميّز');
  if (node.is_active && !node.show_web) flags.push('مخفي عن الموقع');
  if (node.is_active && !node.show_app) flags.push('مخفي عن التطبيق');
  return flags;
}

// ── health checks ──

export interface HealthIssue {
  id: string;
  level: 'warning' | 'info';
  title: string;
  hint: string;
  nodeIds: string[];
  productIds: string[];
}

export interface HealthProduct {
  id: string;
  title: string;
  is_active: boolean;
}

export function healthIssues(
  nodes: readonly CatalogNode[],
  links: readonly ProductLink[],
  products: readonly HealthProduct[],
  counts: ReadonlyMap<string, NodeCounts>,
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const push = (issue: Omit<HealthIssue, 'nodeIds' | 'productIds'> & { nodeIds?: string[]; productIds?: string[] }) => {
    const nodeIds = issue.nodeIds ?? [];
    const productIds = issue.productIds ?? [];
    if (nodeIds.length + productIds.length > 0) issues.push({ ...issue, nodeIds, productIds });
  };

  push({
    id: 'empty-nodes',
    level: 'warning',
    title: 'عناصر فاضية (بلا كتب ولا أبناء)',
    hint: 'مش بتظهر للعميل لو «إخفاء عند الفراغ» مفعّل. احذفها أو أضف لها كتب.',
    nodeIds: nodes
      .filter((n) => (counts.get(n.id)?.total ?? 0) === 0 && !nodes.some((c) => c.parent_id === n.id))
      .map((n) => n.id),
  });

  const byName = new Map<string, CatalogNode[]>();
  for (const n of nodes) {
    const key = n.name_ar.trim();
    byName.set(key, [...(byName.get(key) ?? []), n]);
  }
  push({
    id: 'duplicate-names',
    level: 'warning',
    title: 'أسماء مكررة',
    hint: 'نفس الاسم لسلسلة وتصنيف (أو عنصرين) بيلخبط العميل. غيّر أحدهما.',
    nodeIds: [...byName.values()].filter((list) => list.length > 1).flat().map((n) => n.id),
  });

  push({
    id: 'padded-names',
    level: 'warning',
    title: 'أسماء فيها مسافات زيادة',
    hint: 'مسافة في أول الاسم أو آخره.',
    nodeIds: nodes.filter((n) => n.name_ar !== n.name_ar.trim()).map((n) => n.id),
  });

  push({
    id: 'series-like-names',
    level: 'info',
    title: 'تصنيفات اسمها «سلسلة …»',
    hint: 'اسم يوحي إنها سلسلة وهي تصنيف. فكّر تحويلها لمجموعة أو تغيير الاسم.',
    nodeIds: nodes.filter((n) => n.type === 'category' && n.name_ar.trim().startsWith('سلسلة')).map((n) => n.id),
  });

  push({
    id: 'orphan-categories',
    level: 'info',
    title: 'تصنيفات من غير سلسلة أو قسم فوقها',
    hint: 'مش غلط، بس لو تابعة لسلسلة معينة، انقلها تحتها عشان التنظيم يبان.',
    nodeIds: nodes.filter((n) => n.type === 'category' && n.parent_id === null).map((n) => n.id),
  });

  push({
    id: 'hidden-with-books',
    level: 'warning',
    title: 'عناصر مخفية فيها كتب',
    hint: 'الكتب دي مش هتبان من خلال العنصر ده للعميل.',
    nodeIds: nodes.filter((n) => nodeStatus(n) !== 'visible' && (counts.get(n.id)?.direct ?? 0) > 0).map((n) => n.id),
  });

  const linkedTo = (productId: string, wanted: (n: CatalogNode) => boolean, primaryOnly = false) => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return links.some((l) => {
      if (l.product_id !== productId) return false;
      if (primaryOnly && !l.is_primary) return false;
      const n = byId.get(l.node_id);
      return n ? wanted(n) : false;
    });
  };
  const activeProducts = products.filter((p) => p.is_active);
  push({
    id: 'no-primary-category',
    level: 'warning',
    title: 'كتب مفعّلة بلا تصنيف أساسي',
    hint: 'الكتاب ده مش هيظهر في أي تصنيف.',
    productIds: activeProducts.filter((p) => !linkedTo(p.id, (n) => n.type !== 'series' && n.type !== 'section', true)).map((p) => p.id),
  });
  push({
    id: 'no-series',
    level: 'info',
    title: 'كتب مفعّلة بلا سلسلة',
    hint: 'مش ضروري، بس مش هتظهر في أي سلسلة.',
    productIds: activeProducts.filter((p) => !linkedTo(p.id, (n) => n.type === 'series')).map((p) => p.id),
  });

  return issues;
}
