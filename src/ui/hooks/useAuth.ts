import { useState, useEffect, useCallback } from "react";

interface OrganizationMembership {
  id: string;
  organizationId: string;
  name: string | null;
  role: string;
  isActive: boolean;
  organization?: { id: string; name: string; isActive: boolean; } | null;
}

interface User {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  currentOrganization?: OrganizationMembership | null;
  memberships?: OrganizationMembership[];
}

interface UseAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; }>;
  register: (data: { email: string; password: string; name?: string; organizationName?: string; }) => Promise<{ success: boolean; error?: string; }>;
  switchOrganization: (organizationId: string) => Promise<{ success: boolean; error?: string; }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  handleAuthError: (error: Error) => void;
}

// Helper to access API methods that may not be in the type definitions yet
const getApi = () => (window as any).electron;

export function useAuth(): UseAuthResult {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const api = getApi();
      if (!api?.apiIsAuthenticated) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }
      const authStatus = await api.apiIsAuthenticated();
      setIsAuthenticated(authStatus);

      if (authStatus) {
        const currentUser = await api.apiGetCurrentUser();
        setUser(currentUser);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to check auth status:", error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle authentication errors from API calls
  const handleAuthError = useCallback((error: Error) => {
    if (error.message.includes("Authentication expired") ||
      error.message.includes("Unauthorized") ||
      error.message.includes("401")) {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const api = getApi();
      if (!api?.apiLogin) {
        return { success: false, error: "Electron auth API is unavailable in this browser context" };
      }
      const result = await api.apiLogin(email, password);
      if (result.success) {
        setIsAuthenticated(true);
        setUser(result.user);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Login failed" };
    }
  }, []);

  const register = useCallback(async (data: { email: string; password: string; name?: string; organizationName?: string; }) => {
    try {
      const api = getApi();
      if (!api?.apiRegister) {
        return { success: false, error: "Electron auth API is unavailable in this browser context" };
      }
      const result = await api.apiRegister(data);
      if (result.success) {
        setIsAuthenticated(true);
        setUser(result.user);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Registration failed" };
    }
  }, []);

  const switchOrganization = useCallback(async (organizationId: string) => {
    try {
      const api = getApi();
      if (!api?.apiSwitchOrganization) {
        return { success: false, error: "Electron organization API is unavailable" };
      }
      const result = await api.apiSwitchOrganization(organizationId);
      if (!result.success || !result.user) {
        return { success: false, error: result.error || "Could not switch organization" };
      }
      setUser(result.user);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Could not switch organization",
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const api = getApi();
      if (api?.apiLogout) {
        await api.apiLogout();
      }
    } finally {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    register,
    switchOrganization,
    logout,
    checkAuth,
    handleAuthError,
  };
}
