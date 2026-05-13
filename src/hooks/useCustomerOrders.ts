import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchCustomerOrders } from '@/lib/storefrontOrders';

export function useCustomerOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const email = user?.email ?? undefined;

  useEffect(() => {
    if (!userId && !email) return;

    const channel = supabase
      .channel(`customer-orders-${userId ?? email}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [email, queryClient, userId]);

  return useQuery({
    queryKey: ['customer-orders', userId ?? 'guest', email ?? 'missing'],
    enabled: Boolean(userId || email),
    queryFn: () => fetchCustomerOrders(userId, email),
  });
}
