import { memo } from "react";
import type { PermissionRequest } from "../../store/useAppStore";
import type { CanUseToolResponse } from "../../types";
import { DecisionPanel } from "../DecisionPanel";

interface PermissionRequestsPanelProps {
  requests: PermissionRequest[];
  onPermissionResult: (toolUseId: string, result: CanUseToolResponse) => void;
}

export const PermissionRequestsPanel = memo(({ requests, onPermissionResult }: PermissionRequestsPanelProps) => {
  if (!requests.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <DecisionPanel
          key={request.toolUseId}
          request={request}
          onSubmit={(result) => onPermissionResult(request.toolUseId, result)}
        />
      ))}
    </div>
  );
});

PermissionRequestsPanel.displayName = "PermissionRequestsPanel";
