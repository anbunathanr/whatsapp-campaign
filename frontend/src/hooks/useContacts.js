// useContacts hook - manages contact list state with pagination, filtering, and sorting
import { useState, useEffect, useCallback, useRef } from 'react';
import contactService from '../services/contactService';

const DEFAULT_PAGE_SIZE = 20;

/**
 * @typedef {Object} FilterCriteria
 * @property {string} [industry] - Filter by industry
 * @property {string} [location] - Filter by location
 * @property {string[]} [tags] - Filter by tags
 * @property {string} [search] - Search term
 */

/**
 * @typedef {Object} UseContactsOptions
 * @property {FilterCriteria} [filters] - Initial filter criteria
 * @property {number} [pageSize] - Items per page
 */

/**
 * Hook for managing contact list state
 * @param {UseContactsOptions} options
 */
const useContacts = (options = {}) => {
  const { filters: initialFilters = {}, pageSize: initialPageSize = DEFAULT_PAGE_SIZE } = options;

  const [contacts, setContacts] = useState([]);
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
    // Simple JSON comparison to detect changes
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      filtersRef.current = next;
      setFilters(next);
      setPage(1);
    }
  }, [initialFilters]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: pageSize,
        sortBy,
        sortOrder,
        ...filters,
        // Convert tags array to comma-separated string if needed
        ...(Array.isArray(filters.tags) && filters.tags.length > 0
          ? { tags: filters.tags.join(',') }
          : {}),
      };
      const response = await contactService.getContacts(params);
      const actualData = response.data ?? response; // unwrap standard API envelope if present
      const pagination = actualData.pagination ?? {};
      setContacts(actualData.contacts ?? []);
      const totalCount = pagination.total ?? actualData.total ?? 0;
      const totalPagesCount =
        (pagination.totalPages ?? actualData.totalPages ?? Math.ceil(totalCount / pageSize)) || 0;
      setTotal(totalCount);
      setTotalPages(totalPagesCount);
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const deleteContact = useCallback(async (id) => {
    await contactService.deleteContact(id);
    await fetchContacts();
  }, [fetchContacts]);

  const bulkDelete = useCallback(async (ids) => {
    await contactService.bulkDeleteContacts(ids);
    await fetchContacts();
  }, [fetchContacts]);

  const bulkTag = useCallback(async (ids, tags) => {
    await contactService.bulkTagContacts(ids, tags);
    await fetchContacts();
  }, [fetchContacts]);

  const updateFilters = useCallback((newFilters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
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
    contacts,
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
    deleteContact,
    bulkDelete,
    bulkTag,
    refresh: fetchContacts,
  };
};

export default useContacts;
