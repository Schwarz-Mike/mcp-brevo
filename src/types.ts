"use strict";
// Ambient augmentation for express-session data used across the app.

import "express-session";

declare module "express-session" {
  interface SessionData {
    /** Logged-in username (set after successful login). */
    user?: string;
    userId?: number;
    userRole?: string;
    /** In-flight OAuth authorization request captured on /oauth/authorize. */
    oauth?: {
      client_id: string;
      redirect_uri: string;
      state: string;
      code_challenge: string;
      /** Tenant (Brevo account) the client is being authorized for, if known. */
      resourceTenant: string | null;
    };
  }
}
