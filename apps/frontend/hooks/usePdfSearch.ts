import { useCallback, useRef, useState, type RefObject } from 'react';

export function usePdfSearch(eventBusRef: RefObject<any>) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback((direction: 'next' | 'prev' | 'initial' = 'initial') => {
    const eventBus = eventBusRef.current;
    if (!eventBus || !searchQuery) return;

    eventBus.dispatch('find', {
      source: null,
      type: direction === 'initial' ? '' : 'again',
      query: searchQuery,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: direction === 'prev',
    });
  }, [searchQuery, eventBusRef]);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
  }, []);

  return {
    showSearch,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    handleSearch,
    openSearch,
    closeSearch,
  };
}
