import { Banknote, CircleCheck, Clock, Gift, Headphones, Lock, RotateCcw, ShieldCheck, Star, Truck } from 'lucide-react';
import type { TrustIcon as TrustIconKey } from '@/lib/displaySettings';

const ICONS = {
  shield: ShieldCheck,
  truck: Truck,
  return: RotateCcw,
  cash: Banknote,
  support: Headphones,
  gift: Gift,
  clock: Clock,
  lock: Lock,
  check: CircleCheck,
  star: Star,
} as const;

/** The drawing for a trust badge's icon key (chosen in the dashboard); an unknown key is a tick. */
export default function TrustIcon({ name, size = 14 }: { name: TrustIconKey; size?: number }) {
  const Icon = ICONS[name] ?? CircleCheck;
  return <Icon size={size} />;
}
