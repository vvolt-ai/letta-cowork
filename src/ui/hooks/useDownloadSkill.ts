import { useState } from "react";

interface UseDownloadSkillReturn {
  skillUrl: string;
  setSkillUrl: (url: string) => void;
  skillName: string;
  setSkillName: (name: string) => void;
  skillDownloading: boolean;
  skillDownloadSuccess: boolean;
  skillDownloadError: string | null;
  handleDownloadSkill: () => Promise<void>;
  resetForm: () => void;
}

export function useDownloadSkill(): UseDownloadSkillReturn {
  const [skillUrl, setSkillUrl] = useState("");
  const [skillName, setSkillName] = useState("");
  const [skillDownloading, setSkillDownloading] = useState(false);
  const [skillDownloadSuccess, setSkillDownloadSuccess] = useState(false);
  const [skillDownloadError, setSkillDownloadError] = useState<string | null>(null);

  const resetForm = () => {
    setSkillUrl("");
    setSkillName("");
    setSkillDownloadError(null);
    setSkillDownloadSuccess(false);
    setSkillDownloading(false);
  };

  const handleDownloadSkill = async () => {
    if (!skillUrl.trim()) {
      setSkillDownloadError("Please provide a GitHub URL");
      return;
    }
    
    setSkillDownloading(true);
    setSkillDownloadError(null);
    setSkillDownloadSuccess(false);

    try {
      const result = await window.electron.downloadSkill(
        skillUrl.trim(),
        skillName.trim() || undefined
      );
      
      if (result.success) {
        setSkillDownloadSuccess(true);
      }
    } catch (error) {
      setSkillDownloadError(
        error instanceof Error ? error.message : "Failed to download skill"
      );
    } finally {
      setSkillDownloading(false);
    }
  };

  return {
    skillUrl,
    setSkillUrl,
    skillName,
    setSkillName,
    skillDownloading,
    skillDownloadSuccess,
    skillDownloadError,
    handleDownloadSkill,
    resetForm,
  };
}
