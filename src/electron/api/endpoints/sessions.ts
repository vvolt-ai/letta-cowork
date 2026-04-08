/**
 * Session Endpoints
 * 
 * Note: Session management is handled via the authentication system.
 * This module provides session-related API methods.
 */

import type { BaseHttpClient } from "../client/base-client.js";

/**
 * Session Endpoints Mixin
 * 
 * Provides session-related API methods when mixed with BaseHttpClient.
 */
export class SessionEndpoints {
  /**
   * Get current session info
   */
  static async getSessionInfo(client: BaseHttpClient): Promise<{
    authenticated: boolean;
    user?: {
      id: string;
      email: string;
      organizationId: string;
      role: string;
    };
  }> {
    const isAuth = client.isAuthenticated();
    return {
      authenticated: isAuth,
      user: isAuth ? client.currentUser || undefined : undefined,
    };
  }

  /**
   * Validate current session
   */
  static async validateSession(client: BaseHttpClient): Promise<boolean> {
    try {
      await client.request('/auth/validate');
      return true;
    } catch {
      return false;
    }
  }
}
