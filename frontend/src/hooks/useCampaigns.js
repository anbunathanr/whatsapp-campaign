// useCampaigns hook - manages campaign list state with pagination, filtering, and sorting
import { useState, useEffect, useCallback, useRef } from 'react';
import campaignService from '../services/campaignService';

const DEFAULT_PAGE_SIZE = 10;

/**
 * @typedef {Object} CampaignFilters
 * @property {string} [status]    - Filter by campaign status
 * @property {string} [type]      - Filter by campaign type
 * @property {string} [search]    - Search by campaign name
 * @property {string} [startDate] - ISO date string lower bound
 * @property {string} [endDate]   - ISO date string upper bound
 */

/**
 * @typedef {Object} UseCampaignsOptions
 * @property {CampaignFilters} [filters]  - Initial filter criteria
 * @property {number}          [pageSize] - Items per page
 */

/**
 * Hook for managing campaign list state.
 * @param {UseCampaignsOptions} options
 */
const useCampaigns = (options = {}) => {
  const { filters: initialFilters = {}, pageSize: initialPageSize = DEFAULT_PAGE_SIZE } = options;

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState(initialFilters);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Sync external filters prop into internal state and reset to page 1
  const filtersRef = useRef(initialFilters);
  useEffect(() => {
    const prev = filtersRef.current;
    const next = initialFilters;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      filtersRef.current = next;
      setFilters(next);
      setPage(1);
    }
  }, [initialFilters]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: pageSize,
        sortBy,
        sortOrder,
        ...filters,
      };
      const response = await campaignService.getCampaigns(params);
      const actualData = response.data ?? response; // unwrap standard API envelope if present
      const pagination = actualData.pagination ?? {};
      setCampaigns(actualData.campaigns ?? []);
      const totalCount = pagination.total ?? actualData.total ?? 0;
      const totalPagesCount =
        (pagination.totalPages ?? actualData.totalPages ?? Math.ceil(totalCount / pageSize)) || 0;
      setTotal(totalCount);
      setTotalPages(totalPagesCount);
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const archiveCampaign = useCallback(async (id) => {
    await campaignService.archiveCampaign(id);
    await fetchCampaigns();
  }, [fetchCampaigns]);

  const cloneCampaign = useCallback(async (id) => {
    const cloned = await campaignService.cloneCampaign(id);
    await fetchCampaigns();
    return cloned;
  }, [fetchCampaigns]);

  const updateFilters = useCallback((newFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handleSort = useCallback((field) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortOrder('asc');
      return field;
    });
    setPage(1);
  }, []);

  return {
    campaigns,
    loading,
    error,
    page,
    pageSize,
    total,
    totalPages,
    filters,
    sortBy,
    sortOrder,
    setPage,
    setPageSize,
    updateFilters,
    handleSort,
    archiveCampaign,
    cloneCampaign,
    refresh: fetchCampaigns,
  };
};

export default useCampaigns;
