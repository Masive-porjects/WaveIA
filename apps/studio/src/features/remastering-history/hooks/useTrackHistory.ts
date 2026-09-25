"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/features/auth";
import {
  fetchUserTracks,
  deleteTrack,
  getMasterSignedUrl,
  type Track,
  type TrackFilterStatus,
} from "@/features/tracks";

export interface UseTrackHistoryOptions {
  initialPageSize?: number;
  initialFilter?: TrackFilterStatus;
}

export function useTrackHistory({
  initialPageSize = 10,
  initialFilter = "all",
}: UseTrackHistoryOptions = {}) {
  const { user } = useAuth();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filter, setFilter] = useState<TrackFilterStatus>(initialFilter);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search query 350ms
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1); // reset to page 1 on new search
    }, 350);
  }, []);

  const loadTracks = useCallback(async () => {
    if (!user) {
      setTracks([]);
      setTotalCount(0);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchUserTracks(user.id, {
        page,
        pageSize,
        search: debouncedSearch.trim() || undefined,
        filter,
      });
      setTracks(res.items);
      setTotalCount(res.totalCount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar el historial";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user, page, pageSize, debouncedSearch, filter]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const handleFilterChange = useCallback((newFilter: TrackFilterStatus) => {
    setFilter(newFilter);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  }, []);

  const handleDeleteTrack = useCallback(
    async (track: Track) => {
      if (!user) return;
      try {
        await deleteTrack(track.id, track.storage_path);
        // Refresh or optimistically remove
        setTracks((prev) => prev.filter((t) => t.id !== track.id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al eliminar la canción";
        throw new Error(msg);
      }
    },
    [user],
  );

  const handleDownloadMaster = useCallback(
    async (storagePath: string, filename: string) => {
      try {
        const signedUrl = await getMasterSignedUrl(storagePath);
        const a = document.createElement("a");
        a.href = signedUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        console.error("Error downloading master:", err);
      }
    },
    [],
  );

  return {
    tracks,
    totalCount,
    page,
    pageSize,
    filter,
    search,
    isLoading,
    error,
    handleSearchChange,
    handleFilterChange,
    handlePageChange,
    handlePageSizeChange,
    handleDeleteTrack,
    handleDownloadMaster,
    refresh: loadTracks,
  };
}
