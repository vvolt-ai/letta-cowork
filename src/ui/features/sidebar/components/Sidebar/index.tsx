import { memo, useCallback, useEffect, useState } from 'react';
import { EmailInboxModal } from '../../../email/components/EmailInboxModal';
import { ResumeSessionDialog } from '../index';
import { AgentWorkspaceNavigation } from '../AgentWorkspaceNavigation';
import type { ZohoEmail } from '../../../../types';

export interface SidebarProps {
  connected: boolean;
  onNewSession: (agentId?: string) => void;
  onOpenSettings?: () => void;
  onOpenMemory?: (agentId: string) => void;
  onOpenSchedules?: () => void;
  onOpenRemoteAccess?: () => void;
  onShowChat?: () => void;
  onAgentSelection?: (agentId: string, name?: string) => void;
  lettaEnvOpen: boolean;
  onLettaEnvOpenChange: (open: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onConnectEmail: () => void;
  onDisconnectEmail: () => void;
  isEmailConnected: boolean;
  refetchEmails: () => void;
  emails: ZohoEmail[];
  onUseEmailAsInput: (email: ZohoEmail) => void;
  isProcessingEmailInput?: boolean;
  isFetchingEmails: boolean;
  accountId: string;
  folderId: string;
  selectedAgentId?: string;
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string) => void;
  processingEmailId?: string | null;
  awaitingConversationEmailId?: string | null;
  errorEmailId?: string | null;
  newlyCreatedConversations?: Map<string, { conversationId: string; agentId?: string }>;
  hasMoreEmails?: boolean;
  isLoadingMoreEmails?: boolean;
  onLoadMoreEmails?: () => void;
  userEmail?: string;
  organizations?: Array<{ id: string; name: string; role: string }>;
  currentOrganizationId?: string;
  isSwitchingOrganization?: boolean;
  organizationSwitchError?: string | null;
  onOrganizationChange?: (id: string) => void | Promise<void>;
  onLogout?: () => void;
}
export const Sidebar = memo(function Sidebar(props: SidebarProps) {
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [showEmailView, setShowEmailView] = useState(false),
    [selectedAgent, setSelectedAgent] = useState(props.selectedAgentId ?? '');
  useEffect(() => {
    if (!props.isEmailConnected) setShowEmailView(false);
  }, [props.isEmailConnected]);
  const handleAgent = useCallback(
    (id: string, name?: string) => {
      setSelectedAgent(id);
      props.onAgentSelection?.(id, name);
    },
    [props.onAgentSelection],
  );
  const footer = (
    <div className='agentAccountControls'>
      {(props.organizations?.length ?? 0) > 0 ? (
        <label>
          <span className='sr-only'>Active workspace</span>
          <select
            aria-label='Active workspace'
            value={props.currentOrganizationId ?? ''}
            disabled={props.isSwitchingOrganization || (props.organizations?.length ?? 0) < 2}
            onChange={(event) => void props.onOrganizationChange?.(event.target.value)}
          >
            {props.organizations?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} · {org.role}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {props.isSwitchingOrganization ? <p role='status'>Switching workspace…</p> : null}
      {props.organizationSwitchError ? <p role='alert'>{props.organizationSwitchError}</p> : null}
      {props.userEmail ? (
        <div className='agentAccountIdentity'>
          <span title={props.userEmail}>{props.userEmail}</span>
          {props.onLogout ? (
            <button type='button' onClick={props.onLogout}>
              Logout
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  return (
    <>
      <AgentWorkspaceNavigation
        connected={props.connected}
        scopeKey={`${props.userEmail ?? ''}:${props.currentOrganizationId ?? ''}`}
        suspended={props.isSwitchingOrganization}
        footer={footer}
        onNewChat={props.onNewSession}
        onDeleteSession={props.onDeleteSession}
        onResumeSession={setResumeSessionId}
        onOpenSettings={props.onOpenSettings}
        onOpenMemory={(id) => props.onOpenMemory?.(id)}
        onOpenSchedules={() => props.onOpenSchedules?.()}
        onOpenRemote={() => props.onOpenRemoteAccess?.()}
        onOpenEmails={() => setShowEmailView(true)}
        onShowChat={() => props.onShowChat?.()}
        onSelectedAgentChange={handleAgent}
      />
      <ResumeSessionDialog
        open={!!resumeSessionId}
        resumeSessionId={resumeSessionId}
        onOpenChange={(open) => {
          if (!open) setResumeSessionId(null);
        }}
      />
      <EmailInboxModal
        open={showEmailView}
        onOpenChange={setShowEmailView}
        emails={props.emails}
        isServerConnected={props.connected}
        isEmailConnected={props.isEmailConnected}
        isFetching={props.isFetchingEmails}
        onUseEmailAsInput={props.onUseEmailAsInput}
        isProcessingEmailInput={props.isProcessingEmailInput}
        selectedAgentId={selectedAgent}
        onProcessEmailToAgent={props.onProcessEmailToAgent}
        processingEmailId={props.processingEmailId}
        awaitingConversationEmailId={props.awaitingConversationEmailId}
        errorEmailId={props.errorEmailId}
        newlyCreatedConversations={props.newlyCreatedConversations}
        onRefresh={props.refetchEmails}
        hasMore={props.hasMoreEmails}
        isLoadingMore={props.isLoadingMoreEmails}
        onLoadMore={props.onLoadMoreEmails}
        accountId={props.accountId || undefined}
        folderId={props.folderId || undefined}
      />
    </>
  );
});
