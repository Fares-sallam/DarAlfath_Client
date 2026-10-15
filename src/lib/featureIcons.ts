import {
  Award, BadgePercent, BookOpenText, Clock, CreditCard, Gift, GraduationCap, Headphones,
  Heart, MapPin, Package, Phone, ShieldCheck, Sparkles, Star, Truck, type LucideIcon,
} from 'lucide-react';

/**
 * The icons a box above the footer can carry, by the key the dashboard saves (home_feature_boxes.icon_key).
 * The dashboard offers the same keys; an unknown one falls back to the book.
 */
export const FEATURE_ICONS: Record<string, LucideIcon> = {
  headphones: Headphones,
  'credit-card': CreditCard,
  'book-open-text': BookOpenText,
  truck: Truck,
  gift: Gift,
  'shield-check': ShieldCheck,
  'badge-percent': BadgePercent,
  clock: Clock,
  phone: Phone,
  star: Star,
  award: Award,
  heart: Heart,
  'map-pin': MapPin,
  package: Package,
  sparkles: Sparkles,
  'graduation-cap': GraduationCap,
};

export const featureIcon = (key: string | null | undefined): LucideIcon => (key && FEATURE_ICONS[key]) || BookOpenText;
