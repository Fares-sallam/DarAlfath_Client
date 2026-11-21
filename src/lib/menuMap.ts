// The website's top menu as the dashboard edits it: a main item can hold sub-items, which can hold further
// sub-items, up to MAX_MENU_DEPTH levels (main + 3 levels). An item is linked to a page, a catalog node, a custom
// link, or is a group (a heading that gathers sub-items, e.g. «المواد» holding reading, writing and maths).
// A node item can fill its sub-items automatically from the node's children; a manual row for the same child
// anywhere under that item (hidden, moved into a group) wins over the automatic one. Pure helpers.
import type { CatalogNode } from '@/lib/catalogTree';

export type MenuKind = 'home' | 'books' | 'contact' | 'node' | 'link' | 'group';
export type MenuChannel = 'web' | 'app';

/** Main item (level 1) plus three levels of sub-items. */
export const MAX_MENU_DEPTH = 4;

export interface MenuItem {
  id: string;
  channel: MenuChannel;
  parent_id: string | null;
  kind: MenuKind;
  node_id: string | null;
  label_ar: string | null;
  label_en: string | null;
  url: string | null;
  sort_order: number;
  visible: boolean;
  auto_children: boolean;
  created_at: string;
  updated_at: string;
}

export const MENU_KIND_LABELS: Record<MenuKind, string> = {
  home: 'الرئيسية',
  books: 'الكتب',
  contact: 'تواصل معنا',
  node: 'من السلاسل والتصنيفات',
  link: 'رابط',
  group: 'مجموعة (عنوان يجمّع عناصر)',
};

const FIXED_LABELS: Partial<Record<MenuKind, string>> = { home: 'الرئيسية', books: 'الكتب', contact: 'تواصل معنا' };

export interface ResolvedMenuItem {
  /** the stored row, or null for a sub-item that is filled automatically from the tree */
  item: MenuItem | null;
  /** a stable key for lists */
  key: string;
  kind: MenuKind;
  nodeId: string | null;
  label: string;
  visible: boolean;
  auto: boolean;
  /** 1 for a main item, 2 for its sub-items, and so on */
  level: number;
  /** the item this one sits inside (null for a main item) */
  parent: ResolvedMenuItem | null;
  children: ResolvedMenuItem[];
}

export function itemLabel(item: Pick<MenuItem, 'kind' | 'node_id' | 'label_ar'>, nodes: readonly CatalogNode[]): string {
  const own = item.label_ar?.trim();
  if (own) return own;
  if (item.kind === 'node') return nodes.find((n) => n.id === item.node_id)?.name_ar ?? 'عنصر محذوف';
  return FIXED_LABELS[item.kind] ?? '';
}

const bySort = (a: MenuItem, b: MenuItem) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** The menu as the website draws it: main items, each with its sub-items (manual first, then the automatic ones), at every level. */
export function resolveMenu(items: readonly MenuItem[], nodes: readonly CatalogNode[], channel: MenuChannel = 'web'): ResolvedMenuItem[] {
  const inChannel = items.filter((i) => i.channel === channel);
  const children = new Map<string | null, MenuItem[]>();
  for (const item of inChannel) {
    const list = children.get(item.parent_id) ?? [];
    list.push(item);
    children.set(item.parent_id, list);
  }
  for (const list of children.values()) list.sort(bySort);

  /** every catalog node a manual row under `id` points at, at any depth */
  const nodesUnder = (id: string, seen: Set<string>): Set<string> => {
    const out = new Set<string>();
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (child.node_id) out.add(child.node_id);
      for (const nodeId of nodesUnder(child.id, seen)) out.add(nodeId);
    }
    return out;
  };

  const build = (item: MenuItem, parent: ResolvedMenuItem | null, level: number, seen: Set<string>): ResolvedMenuItem => {
    const resolved: ResolvedMenuItem = {
      item, key: item.id, kind: item.kind, nodeId: item.node_id, label: itemLabel(item, nodes),
      visible: item.visible, auto: false, level, parent, children: [],
    };
    const nextSeen = new Set(seen).add(item.id);
    const subs = level >= MAX_MENU_DEPTH
      ? []
      : (children.get(item.id) ?? []).filter((c) => !nextSeen.has(c.id)).map((c) => build(c, resolved, level + 1, nextSeen));

    if (item.auto_children && item.node_id && level < MAX_MENU_DEPTH) {
      const represented = nodesUnder(item.id, new Set([item.id]));
      const auto = nodes
        .filter((n) => n.parent_id === item.node_id && n.is_active && !represented.has(n.id))
        .sort((a, b) => a.sort_web - b.sort_web || a.name_ar.localeCompare(b.name_ar, 'ar'));
      for (const child of auto) {
        subs.push({
          item: null, key: `auto-${item.id}-${child.id}`, kind: 'node', nodeId: child.id, label: child.name_ar,
          visible: true, auto: true, level: level + 1, parent: resolved, children: [],
        });
      }
    }
    resolved.children = subs;
    return resolved;
  };

  return (children.get(null) ?? []).map((main) => build(main, null, 1, new Set()));
}

/** Every item of the resolved tree, in drawing order. */
export function flattenMenu(menu: readonly ResolvedMenuItem[]): ResolvedMenuItem[] {
  return menu.flatMap((entry) => [entry, ...flattenMenu(entry.children)]);
}

/** 1 for a main item, 2 for a sub-item of a main item, … (0 when the id is unknown). */
export function menuLevel(items: readonly MenuItem[], id: string): number {
  const byId = new Map(items.map((i) => [i.id, i]));
  let level = 0;
  let cursor: string | null = id;
  const seen = new Set<string>();
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    level += 1;
    cursor = byId.get(cursor)!.parent_id;
  }
  return level;
}

/** How many levels sit below an item (0 when it holds nothing). */
export function menuHeight(items: readonly MenuItem[], id: string): number {
  const byParent = new Map<string, MenuItem[]>();
  for (const item of items) {
    if (!item.parent_id) continue;
    byParent.set(item.parent_id, [...(byParent.get(item.parent_id) ?? []), item]);
  }
  const walk = (current: string, seen: Set<string>): number => {
    let deepest = 0;
    for (const child of byParent.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      deepest = Math.max(deepest, 1 + walk(child.id, new Set(seen).add(child.id)));
    }
    return deepest;
  };
  return walk(id, new Set([id]));
}

/** Every item inside `id`, at any depth. */
export function menuDescendantIds(items: readonly MenuItem[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (current: string) => {
    for (const child of items.filter((i) => i.parent_id === current)) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** Why an item cannot be placed inside `parentId`, or null when it can (null parent = make it a main item). */
export function placementProblem(items: readonly MenuItem[], id: string, parentId: string | null): string | null {
  if (parentId === null) return null;
  if (parentId === id) return 'مينفعش العنصر يبقى جوه نفسه.';
  if (!items.some((i) => i.id === parentId)) return 'العنصر اللي هتحط جواه مش موجود.';
  if (menuDescendantIds(items, id).has(parentId)) return 'مينفعش تحط العنصر جوه واحد من اللي جواه.';
  if (menuLevel(items, parentId) + 1 + menuHeight(items, id) > MAX_MENU_DEPTH) {
    return `القايمة لحد ${MAX_MENU_DEPTH} مستويات (رئيسي + 3 مستويات فرعية).`;
  }
  return null;
}

/** The sibling ids after moving one step, or null when it cannot move. */
export function moveWithinParent(items: readonly MenuItem[], id: string, direction: -1 | 1): string[] | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const siblings = items.filter((i) => i.channel === item.channel && i.parent_id === item.parent_id).sort(bySort);
  const index = siblings.findIndex((i) => i.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return null;
  const ids = siblings.map((i) => i.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

/** The names from the main item down to this item's parent, e.g. ["الفتح الرباني", "المواد"]. */
export function placementPath(entry: ResolvedMenuItem): string[] {
  const names: string[] = [];
  let cursor = entry.parent;
  while (cursor) {
    names.unshift(cursor.label);
    cursor = cursor.parent;
  }
  return names;
}

/** Where an item sits, in words: "رئيسي" or "فرعي داخل: الفتح الرباني ‹ المواد". */
export function placementText(entry: ResolvedMenuItem): string {
  const path = placementPath(entry);
  return path.length === 0 ? 'رئيسي' : `فرعي داخل: ${path.join(' ‹ ')}`;
}

/** The items an item may be placed inside (for a "move to" list), with their path, in drawing order. */
export function parentOptions(menu: readonly ResolvedMenuItem[], items: readonly MenuItem[], id: string): { id: string; label: string; level: number }[] {
  return flattenMenu(menu)
    .filter((entry) => entry.item && !entry.auto && placementProblem(items, id, entry.item.id) === null)
    .map((entry) => ({ id: entry.item!.id, label: [...placementPath(entry), entry.label].join(' ‹ '), level: entry.level }));
}

/** The next free position inside a parent (or among the main items). */
export function nextMenuSort(items: readonly MenuItem[], channel: MenuChannel, parentId: string | null): number {
  const orders = items.filter((i) => i.channel === channel && i.parent_id === parentId).map((i) => i.sort_order);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/** A link a person typed: it must be a page of the site (starting with /) or an https address. */
export function validMenuUrl(url: string): boolean {
  const value = url.trim();
  return /^\/(?!\/)/.test(value) || /^https:\/\/\S+$/i.test(value);
}
