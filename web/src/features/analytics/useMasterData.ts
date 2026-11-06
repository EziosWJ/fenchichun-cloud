import { useQuery } from '@tanstack/react-query';
import { categories, materials, parties, sites } from '../weighbridge/api';

export function useAnalyticsMasterData(includeParties = false) {
  const sitesQuery = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const materialsQuery = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials });
  const categoriesQuery = useQuery({ queryKey: ['weighbridge', 'categories'], queryFn: categories });
  const partiesQuery = useQuery({
    queryKey: ['weighbridge', 'parties'],
    queryFn: parties,
    enabled: includeParties,
  });
  return {
    sites: sitesQuery.data ?? [],
    materials: materialsQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    parties: partiesQuery.data ?? [],
    loading: sitesQuery.isLoading || materialsQuery.isLoading || categoriesQuery.isLoading || partiesQuery.isLoading,
  };
}
