import { useCallback, useRef, useState } from "react";

export function useAdminRefresh(fetcher, successMsg = "Data berhasil diperbarui") {
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);
  const [toast, setToast] = useState(null);
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetcher(); 
      setLoadedAt(new Date());

      // biar gak spam toast pas first load
      if (!firstLoad.current) {
        setToast({ type: "success", msg: successMsg });
      }
    } catch (e) {
      console.error("❌ refresh error:", e);
      setToast({ type: "error", msg: e?.message || "Gagal memuat data" });
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [fetcher, successMsg]);

  return { loading, loadedAt, toast, setToast, refresh };
}
