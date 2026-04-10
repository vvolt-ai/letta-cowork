import { useCallback, useEffect, useState } from "react";

export interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  folder: string;
  updatedAt: number;
}

export function useListSkills() {
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).electron.listSkills();
      if (result?.success) {
        setSkills(result.skills ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { skills, loading, error, refresh };
}
