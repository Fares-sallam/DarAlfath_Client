import { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface WishlistContextValue {
  wishlistIds: string[];
  count: number;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined);
const STORAGE_KEY = 'daralfath_client_wishlist';

function loadWishlistFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: reads localStorage synchronously on first render, before
  // any effect can run. A separate load-effect would race with the save-effect
  // below — on mount both fire in the same pass, and the save-effect (still
  // closing over the initial [] state) would overwrite the just-read value
  // with an empty array.
  const [wishlistIds, setWishlistIds] = useState<string[]>(loadWishlistFromStorage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wishlistIds));
  }, [wishlistIds]);

  const toggleWishlist = (productId: string) => {
    setWishlistIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [productId, ...prev]
    );
  };

  const value = useMemo(
    () => ({
      wishlistIds,
      count: wishlistIds.length,
      toggleWishlist,
      isInWishlist: (productId: string) => wishlistIds.includes(productId),
      clearWishlist: () => setWishlistIds([]),
    }),
    [wishlistIds]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider');
  return context;
}
