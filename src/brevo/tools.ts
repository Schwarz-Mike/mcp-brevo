import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = "https://api.brevo.com/v3";

// ==================== INTERFACES ====================

interface TransactionalEvent {
  email: string;
  date: string;
  messageId: string;
  event: string;
  subject?: string;
  tag?: string;
  templateId?: number;
}

interface TransactionalEventsResponse {
  events: TransactionalEvent[];
}

interface TransactionalStats {
  date: string;
  requests: number;
  delivered: number;
  hardBounces: number;
  softBounces: number;
  blocked: number;
  unsubscribed: number;
  clicked: number;
  opened: number;
  invalid: number;
  deferred: number;
  complaints: number;
}

interface Recipient {
  email: string;
  name?: string;
}

interface SendEmailRequest {
  sender?: { name?: string; email: string };
  to: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  templateId?: number;
  params?: Record<string, string>;
  tags?: string[];
  replyTo?: { email: string; name?: string };
}

interface Contact {
  email: string;
  id: number;
  emailBlacklisted: boolean;
  smsBlacklisted: boolean;
  createdAt: string;
  modifiedAt: string;
  attributes: Record<string, unknown>;
  listIds: number[];
  statistics?: {
    messagesSent?: Array<{ campaignId: number; eventTime: string }>;
    opened?: Array<{ campaignId: number; count: number; eventTime: string; ip: string }>;
    clicked?: Array<{ campaignId: number; links: Array<{ count: number; eventTime: string; ip: string; url: string }> }>;
    transacAttributes?: Array<unknown>;
  };
}

interface ContactList {
  id: number;
  name: string;
  totalBlacklisted: number;
  totalSubscribers: number;
  folderId: number;
  createdAt: string;
  campaignStats?: Array<unknown>;
  dynamicList?: boolean;
}

// ==================== BREVO SERVER FACTORY ====================

/**
 * Build a Brevo MCP Server bound to one specific API key.
 * Every tool handler closes over `apiKey`, so a single process can serve
 * many tenants (each with its own key) by calling this factory per request.
 */
export function createBrevoServer(apiKey: string, serverName = "brevo"): Server {

// ==================== API HELPERS ====================

async function fetchBrevoAPI<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, value);
      }
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

async function postBrevoAPI<T>(endpoint: string, body: object): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

async function putBrevoAPI<T>(endpoint: string, body: object): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "PUT",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function deleteBrevoAPI(endpoint: string): Promise<void> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "DELETE",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API error: ${response.status} - ${errorText}`);
  }
}

// ==================== CAMPAIGN INTERFACES ====================

interface Campaign {
  id: number;
  name: string;
  subject: string;
  type: string;
  status: string;
  scheduledAt?: string;
  sentDate?: string;
  createdAt?: string;
  modifiedAt?: string;
  sender?: { name: string; email: string; id?: number };
  replyTo?: string;
  toField?: string;
  previewText?: string;
  recipients?: { lists: Array<{ id: number; name: string }>; exclusionLists?: Array<{ id: number; name: string }> };
  statistics?: {
    globalStats?: {
      sent?: number;
      delivered?: number;
      opened?: number;
      clicks?: number;
      hardBounces?: number;
      softBounces?: number;
      unsubscribed?: number;
      complaints?: number;
    };
  };
}

interface CampaignRecipients {
  listIds?: number[];
  exclusionListIds?: number[];
}

interface CreateCampaignBody {
  name: string;
  subject: string;
  sender: { name: string; email: string; id?: number };
  type: string;
  htmlContent?: string;
  htmlUrl?: string;
  templateId?: number;
  scheduledAt?: string;
  recipients?: CampaignRecipients;
  replyTo?: string;
  toField?: string;
  previewText?: string;
  params?: Record<string, unknown>;
}

// ==================== SERVER SETUP ====================

const server = new Server(
  {
    name: serverName,
    version: "4.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ==================== TOOL DEFINITIONS ====================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ========================================
      // ===== EMAIL SENDING TOOLS =====
      // ========================================
      {
        name: "send_email",
        description: "Send a transactional email to one or more recipients. Can use a template or custom content.",
        inputSchema: {
          type: "object",
          properties: {
            to: {
              type: "array",
              description: "Array of recipient objects with 'email' and optional 'name'",
              items: {
                type: "object",
                properties: {
                  email: { type: "string", description: "Recipient email address" },
                  name: { type: "string", description: "Recipient name (optional)" }
                },
                required: ["email"]
              }
            },
            subject: {
              type: "string",
              description: "Email subject line (required if not using template)"
            },
            htmlContent: {
              type: "string",
              description: "HTML content of the email (required if not using template)"
            },
            textContent: {
              type: "string",
              description: "Plain text content (optional fallback)"
            },
            templateId: {
              type: "number",
              description: "Brevo template ID to use instead of custom content"
            },
            params: {
              type: "object",
              description: "Template parameters/variables as key-value pairs (e.g., {\"FIRSTNAME\": \"Mike\"})"
            },
            senderEmail: {
              type: "string",
              description: "Sender email address (must be verified in Brevo)"
            },
            senderName: {
              type: "string",
              description: "Sender name"
            },
            replyToEmail: {
              type: "string",
              description: "Reply-to email address"
            },
            tags: {
              type: "array",
              description: "Tags for tracking/categorization",
              items: { type: "string" }
            }
          },
          required: ["to"]
        }
      },
      {
        name: "send_template_email",
        description: "Send a transactional email using a Brevo template. Simpler than send_email when using templates.",
        inputSchema: {
          type: "object",
          properties: {
            templateId: {
              type: "number",
              description: "Brevo template ID"
            },
            to: {
              type: "array",
              description: "Array of recipient objects with 'email' and optional 'name'",
              items: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  name: { type: "string" }
                },
                required: ["email"]
              }
            },
            params: {
              type: "object",
              description: "Template parameters (e.g., {\"FIRSTNAME\": \"Mike\", \"LASTNAME\": \"Schwarz\"})"
            },
            tags: {
              type: "array",
              description: "Tags for tracking",
              items: { type: "string" }
            }
          },
          required: ["templateId", "to"]
        }
      },

      // ========================================
      // ===== STATISTICS & EVENTS TOOLS =====
      // ========================================
      {
        name: "get_transactional_events",
        description: "Get transactional email events (delivered, opened, clicked, bounced, etc.) for a date range",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of events to return (max 100)",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            },
            startDate: {
              type: "string",
              description: "Start date in YYYY-MM-DD format"
            },
            endDate: {
              type: "string",
              description: "End date in YYYY-MM-DD format"
            },
            email: {
              type: "string",
              description: "Filter by recipient email address"
            },
            event: {
              type: "string",
              description: "Filter by event type: delivered, opened, clicked, softBounces, hardBounces, blocked, spam, invalid, deferred, unsubscribed",
              enum: ["delivered", "opened", "clicked", "softBounces", "hardBounces", "blocked", "spam", "invalid", "deferred", "unsubscribed"]
            },
            tags: {
              type: "string",
              description: "Filter by tag (comma-separated for multiple)"
            },
            templateId: {
              type: "number",
              description: "Filter by template ID"
            },
            sort: {
              type: "string",
              description: "Sort order: asc or desc",
              enum: ["asc", "desc"],
              default: "desc"
            }
          }
        }
      },
      {
        name: "get_transactional_stats",
        description: "Get aggregated transactional email statistics for a date range",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date in YYYY-MM-DD format"
            },
            endDate: {
              type: "string",
              description: "End date in YYYY-MM-DD format"
            },
            days: {
              type: "number",
              description: "Number of days to look back (alternative to start/end date)",
              default: 7
            },
            tag: {
              type: "string",
              description: "Filter by specific tag"
            }
          }
        }
      },
      {
        name: "get_email_activity",
        description: "Get all transactional email activity for a specific email address",
        inputSchema: {
          type: "object",
          properties: {
            email: {
              type: "string",
              description: "Email address to look up"
            },
            startDate: {
              type: "string",
              description: "Start date in YYYY-MM-DD format"
            },
            endDate: {
              type: "string",
              description: "End date in YYYY-MM-DD format"
            }
          },
          required: ["email"]
        }
      },

      // ========================================
      // ===== TEMPLATE TOOLS =====
      // ========================================
      {
        name: "get_transactional_templates",
        description: "List all transactional email templates",
        inputSchema: {
          type: "object",
          properties: {
            templateStatus: {
              type: "boolean",
              description: "Filter by active (true) or inactive (false) templates"
            },
            limit: {
              type: "number",
              description: "Number of templates to return",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            }
          }
        }
      },
      {
        name: "get_template_details",
        description: "Get details of a specific transactional email template",
        inputSchema: {
          type: "object",
          properties: {
            templateId: {
              type: "number",
              description: "Template ID to retrieve"
            }
          },
          required: ["templateId"]
        }
      },

      // ========================================
      // ===== BLOCKED CONTACTS & SENDERS =====
      // ========================================
      {
        name: "get_blocked_contacts",
        description: "Get list of blocked/unsubscribed contacts for transactional emails",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date in YYYY-MM-DD format"
            },
            endDate: {
              type: "string",
              description: "End date in YYYY-MM-DD format"
            },
            limit: {
              type: "number",
              description: "Number of contacts to return",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            },
            sort: {
              type: "string",
              description: "Sort order: asc or desc",
              enum: ["asc", "desc"],
              default: "desc"
            }
          }
        }
      },
      {
        name: "get_senders",
        description: "Get list of verified senders for transactional emails",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },

      // ========================================
      // ===== CONTACT MANAGEMENT TOOLS =====
      // ========================================
      {
        name: "get_contacts",
        description: "Get a list of all contacts with pagination. Can filter by list, modified date, or creation date.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of contacts to return per page (max 1000)",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            },
            modifiedSince: {
              type: "string",
              description: "Filter contacts modified after this date (YYYY-MM-DD or ISO format)"
            },
            createdSince: {
              type: "string",
              description: "Filter contacts created after this date (YYYY-MM-DD or ISO format)"
            },
            sort: {
              type: "string",
              description: "Sort order: asc or desc by modification date",
              enum: ["asc", "desc"],
              default: "desc"
            }
          }
        }
      },
      {
        name: "get_contact_info",
        description: "Get detailed information about a specific contact including attributes, lists, and campaign statistics.",
        inputSchema: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "Contact identifier: email address, phone number, or contact ID"
            },
            identifierType: {
              type: "string",
              description: "Type of identifier: 'email' (default), 'phone', 'id', or 'ext_id'",
              enum: ["email", "phone", "id", "ext_id"],
              default: "email"
            },
            startDate: {
              type: "string",
              description: "Start date for campaign statistics (YYYY-MM-DD)"
            },
            endDate: {
              type: "string",
              description: "End date for campaign statistics (YYYY-MM-DD)"
            }
          },
          required: ["identifier"]
        }
      },
      {
        name: "create_contact",
        description: "Create a new contact in Brevo. Can optionally add to lists and set attributes.",
        inputSchema: {
          type: "object",
          properties: {
            email: {
              type: "string",
              description: "Email address of the contact"
            },
            attributes: {
              type: "object",
              description: "Contact attributes (e.g., {\"FIRSTNAME\": \"Mike\", \"LASTNAME\": \"Schwarz\", \"SMS\": \"+49123456789\"})"
            },
            listIds: {
              type: "array",
              description: "Array of list IDs to add the contact to",
              items: { type: "number" }
            },
            emailBlacklisted: {
              type: "boolean",
              description: "Set to true to blacklist contact for emails",
              default: false
            },
            smsBlacklisted: {
              type: "boolean",
              description: "Set to true to blacklist contact for SMS",
              default: false
            },
            updateEnabled: {
              type: "boolean",
              description: "If true, update contact if it already exists. If false, return error for existing contact.",
              default: false
            },
            smtpBlacklistSender: {
              type: "array",
              description: "Array of sender emails to blacklist for this contact",
              items: { type: "string" }
            }
          },
          required: ["email"]
        }
      },
      {
        name: "update_contact",
        description: "Update an existing contact's attributes, list memberships, or blacklist status.",
        inputSchema: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "Contact identifier: email address, phone number, or contact ID"
            },
            identifierType: {
              type: "string",
              description: "Type of identifier: 'email' (default), 'phone', 'id', or 'ext_id'",
              enum: ["email", "phone", "id", "ext_id"],
              default: "email"
            },
            attributes: {
              type: "object",
              description: "Contact attributes to update (e.g., {\"FIRSTNAME\": \"Mike\", \"LASTNAME\": \"Schwarz\"})"
            },
            emailBlacklisted: {
              type: "boolean",
              description: "Set email blacklist status"
            },
            smsBlacklisted: {
              type: "boolean",
              description: "Set SMS blacklist status"
            },
            listIds: {
              type: "array",
              description: "List IDs to add the contact to",
              items: { type: "number" }
            },
            unlinkListIds: {
              type: "array",
              description: "List IDs to remove the contact from",
              items: { type: "number" }
            },
            smtpBlacklistSender: {
              type: "array",
              description: "Sender emails to blacklist for this contact",
              items: { type: "string" }
            }
          },
          required: ["identifier"]
        }
      },
      {
        name: "delete_contact",
        description: "Permanently delete a contact from Brevo. This action cannot be undone!",
        inputSchema: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "Contact identifier: email address, phone number, or contact ID"
            },
            identifierType: {
              type: "string",
              description: "Type of identifier: 'email' (default), 'phone', 'id', or 'ext_id'",
              enum: ["email", "phone", "id", "ext_id"],
              default: "email"
            }
          },
          required: ["identifier"]
        }
      },
      {
        name: "get_contact_stats",
        description: "Get campaign statistics (opens, clicks, etc.) for a specific contact.",
        inputSchema: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "Contact identifier: email address, phone number, or contact ID"
            },
            identifierType: {
              type: "string",
              description: "Type of identifier: 'email' (default), 'phone', 'id', or 'ext_id'",
              enum: ["email", "phone", "id", "ext_id"],
              default: "email"
            },
            startDate: {
              type: "string",
              description: "Start date for statistics (YYYY-MM-DD)"
            },
            endDate: {
              type: "string",
              description: "End date for statistics (YYYY-MM-DD)"
            }
          },
          required: ["identifier"]
        }
      },

      // ========================================
      // ===== LIST MANAGEMENT TOOLS =====
      // ========================================
      {
        name: "get_lists",
        description: "Get all contact lists with subscriber counts and metadata.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of lists to return per page (max 50)",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            },
            sort: {
              type: "string",
              description: "Sort order: asc or desc by ID",
              enum: ["asc", "desc"],
              default: "desc"
            }
          }
        }
      },
      {
        name: "get_list",
        description: "Get detailed information about a specific list including statistics.",
        inputSchema: {
          type: "object",
          properties: {
            listId: {
              type: "number",
              description: "The ID of the list to retrieve"
            },
            startDate: {
              type: "string",
              description: "Start date for campaign statistics (YYYY-MM-DD)"
            },
            endDate: {
              type: "string",
              description: "End date for campaign statistics (YYYY-MM-DD)"
            }
          },
          required: ["listId"]
        }
      },
      {
        name: "get_contacts_from_list",
        description: "Get all contacts that belong to a specific list.",
        inputSchema: {
          type: "object",
          properties: {
            listId: {
              type: "number",
              description: "The ID of the list"
            },
            limit: {
              type: "number",
              description: "Number of contacts to return per page (max 500)",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            },
            modifiedSince: {
              type: "string",
              description: "Filter contacts modified after this date (YYYY-MM-DD or ISO format)"
            },
            sort: {
              type: "string",
              description: "Sort order: asc or desc",
              enum: ["asc", "desc"],
              default: "desc"
            }
          },
          required: ["listId"]
        }
      },
      {
        name: "create_list",
        description: "Create a new contact list.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the list"
            },
            folderId: {
              type: "number",
              description: "ID of the folder to put the list in (use 1 for root folder)"
            }
          },
          required: ["name", "folderId"]
        }
      },
      {
        name: "update_list",
        description: "Update an existing list's name or folder.",
        inputSchema: {
          type: "object",
          properties: {
            listId: {
              type: "number",
              description: "The ID of the list to update"
            },
            name: {
              type: "string",
              description: "New name for the list"
            },
            folderId: {
              type: "number",
              description: "New folder ID for the list"
            }
          },
          required: ["listId"]
        }
      },
      {
        name: "delete_list",
        description: "Delete a contact list. Contacts in the list will NOT be deleted.",
        inputSchema: {
          type: "object",
          properties: {
            listId: {
              type: "number",
              description: "The ID of the list to delete"
            }
          },
          required: ["listId"]
        }
      },
      {
        name: "add_contacts_to_list",
        description: "Add one or more contacts to a list by email or ID.",
        inputSchema: {
          type: "object",
          properties: {
            listId: {
              type: "number",
              description: "The ID of the list"
            },
            emails: {
              type: "array",
              description: "Array of email addresses to add",
              items: { type: "string" }
            },
            ids: {
              type: "array",
              description: "Array of contact IDs to add",
              items: { type: "number" }
            }
          },
          required: ["listId"]
        }
      },
      {
        name: "remove_contacts_from_list",
        description: "Remove one or more contacts from a list. Contacts are NOT deleted, just unlinked.",
        inputSchema: {
          type: "object",
          properties: {
            listId: {
              type: "number",
              description: "The ID of the list"
            },
            emails: {
              type: "array",
              description: "Array of email addresses to remove",
              items: { type: "string" }
            },
            ids: {
              type: "array",
              description: "Array of contact IDs to remove",
              items: { type: "number" }
            }
          },
          required: ["listId"]
        }
      },

      // ========================================
      // ===== FOLDER MANAGEMENT TOOLS =====
      // ========================================
      {
        name: "get_folders",
        description: "Get all folders for organizing contact lists.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of folders to return per page",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            },
            sort: {
              type: "string",
              description: "Sort order: asc or desc",
              enum: ["asc", "desc"],
              default: "desc"
            }
          }
        }
      },
      {
        name: "get_folder_lists",
        description: "Get all lists within a specific folder.",
        inputSchema: {
          type: "object",
          properties: {
            folderId: {
              type: "number",
              description: "The ID of the folder"
            },
            limit: {
              type: "number",
              description: "Number of lists to return per page",
              default: 50
            },
            offset: {
              type: "number",
              description: "Starting offset for pagination",
              default: 0
            },
            sort: {
              type: "string",
              description: "Sort order: asc or desc",
              enum: ["asc", "desc"],
              default: "desc"
            }
          },
          required: ["folderId"]
        }
      },
      {
        name: "create_folder",
        description: "Create a new folder for organizing lists.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the folder"
            }
          },
          required: ["name"]
        }
      },
      {
        name: "update_folder",
        description: "Rename an existing folder.",
        inputSchema: {
          type: "object",
          properties: {
            folderId: {
              type: "number",
              description: "The ID of the folder to update"
            },
            name: {
              type: "string",
              description: "New name for the folder"
            }
          },
          required: ["folderId", "name"]
        }
      },
      {
        name: "delete_folder",
        description: "Delete a folder. Lists in the folder will be moved to the root folder.",
        inputSchema: {
          type: "object",
          properties: {
            folderId: {
              type: "number",
              description: "The ID of the folder to delete"
            }
          },
          required: ["folderId"]
        }
      },

      // ========================================
      // ===== CAMPAIGN TOOLS =====
      // ========================================
      {
        name: "get_campaigns",
        description: "List all email campaigns with optional filtering by status or type. Returns campaign IDs, names, status, stats.",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description: "Filter by type: classic or trigger",
              enum: ["classic", "trigger"]
            },
            status: {
              type: "string",
              description: "Filter by status: draft, sent, archive, queued, suspended, inProcess",
              enum: ["draft", "sent", "archive", "queued", "suspended", "inProcess"]
            },
            statistics: {
              type: "string",
              description: "Include stats: globalStats, linksStats, statsByDomain, statsByDevice, statsByBrowser",
              enum: ["globalStats", "linksStats", "statsByDomain", "statsByDevice", "statsByBrowser"]
            },
            startDate: { type: "string", description: "Filter campaigns sent after this date (YYYY-MM-DD)" },
            endDate: { type: "string", description: "Filter campaigns sent before this date (YYYY-MM-DD)" },
            limit: { type: "number", description: "Number of campaigns to return (max 500)", default: 50 },
            offset: { type: "number", description: "Starting offset for pagination", default: 0 },
            sort: { type: "string", enum: ["asc", "desc"], default: "desc" }
          }
        }
      },
      {
        name: "get_campaign",
        description: "Get full details and statistics of a specific email campaign.",
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number", description: "ID of the campaign" },
            statistics: {
              type: "string",
              description: "Which statistics to include: globalStats, linksStats, statsByDomain, statsByDevice, statsByBrowser",
              enum: ["globalStats", "linksStats", "statsByDomain", "statsByDevice", "statsByBrowser"]
            }
          },
          required: ["campaignId"]
        }
      },
      {
        name: "create_campaign",
        description: "Create a new email campaign. Use templateId OR htmlContent. Set scheduledAt to schedule it, or use send_campaign_now to send immediately after creating.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Internal name for the campaign" },
            subject: { type: "string", description: "Email subject line" },
            senderName: { type: "string", description: "Sender display name" },
            senderEmail: { type: "string", description: "Sender email address (must be verified in Brevo)" },
            senderId: { type: "number", description: "Sender ID from Brevo (alternative to senderEmail)" },
            templateId: { type: "number", description: "Use a Brevo template as email content" },
            htmlContent: { type: "string", description: "Custom HTML content (used if no templateId)" },
            htmlUrl: { type: "string", description: "URL to fetch HTML content from (alternative to htmlContent)" },
            listIds: {
              type: "array",
              description: "List IDs of recipients",
              items: { type: "number" }
            },
            exclusionListIds: {
              type: "array",
              description: "List IDs to exclude from recipients",
              items: { type: "number" }
            },
            scheduledAt: { type: "string", description: "Schedule date/time in ISO 8601 format (e.g. 2026-06-01T10:00:00+02:00). Leave empty for draft." },
            replyTo: { type: "string", description: "Reply-to email address" },
            toField: { type: "string", description: "Personalization token for To field, e.g. '{{contact.FIRSTNAME}} {{contact.LASTNAME}}'" },
            previewText: { type: "string", description: "Preview text shown in inbox before opening the email" }
          },
          required: ["name", "subject", "senderEmail", "listIds"]
        }
      },
      {
        name: "update_campaign",
        description: "Update an existing email campaign (name, subject, content, recipients, schedule, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number", description: "ID of the campaign to update" },
            name: { type: "string", description: "New internal campaign name" },
            subject: { type: "string", description: "New email subject" },
            senderName: { type: "string", description: "Sender display name" },
            senderEmail: { type: "string", description: "Sender email address" },
            senderId: { type: "number", description: "Sender ID from Brevo" },
            templateId: { type: "number", description: "Template ID to use" },
            htmlContent: { type: "string", description: "Custom HTML content" },
            listIds: { type: "array", description: "Recipient list IDs", items: { type: "number" } },
            exclusionListIds: { type: "array", description: "Exclusion list IDs", items: { type: "number" } },
            scheduledAt: { type: "string", description: "New schedule date/time in ISO 8601 format" },
            replyTo: { type: "string", description: "Reply-to email address" },
            previewText: { type: "string", description: "Preview text for inbox" }
          },
          required: ["campaignId"]
        }
      },
      {
        name: "send_campaign_now",
        description: "Immediately send an existing campaign to all recipients. The campaign must be in 'draft' or 'queued' status.",
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number", description: "ID of the campaign to send" }
          },
          required: ["campaignId"]
        }
      },
      {
        name: "schedule_campaign",
        description: "Schedule an existing campaign to be sent at a specific date and time.",
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number", description: "ID of the campaign to schedule" },
            scheduledAt: { type: "string", description: "Date/time to send in ISO 8601 format (e.g. 2026-06-01T10:00:00+02:00)" }
          },
          required: ["campaignId", "scheduledAt"]
        }
      },
      {
        name: "send_campaign_test",
        description: "Send a test version of a campaign to one or more test email addresses before sending to the full list.",
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number", description: "ID of the campaign" },
            emailTo: {
              type: "array",
              description: "List of test email addresses to send the test to",
              items: { type: "string" }
            }
          },
          required: ["campaignId", "emailTo"]
        }
      },
      {
        name: "delete_campaign",
        description: "Delete an email campaign. Only campaigns in draft status can be deleted.",
        inputSchema: {
          type: "object",
          properties: {
            campaignId: { type: "number", description: "ID of the campaign to delete" }
          },
          required: ["campaignId"]
        }
      },

      // ========================================
      // ===== CONTACT ATTRIBUTES TOOLS =====
      // ========================================
      {
        name: "get_attributes",
        description: "Get all contact attributes (custom fields) defined in the account.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

// ==================== TOOL HANDLERS ====================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ========================================
      // ===== EMAIL SENDING HANDLERS =====
      // ========================================
      case "send_email": {
        const toRecipients = args?.to as Recipient[];
        if (!toRecipients || toRecipients.length === 0) {
          throw new Error("At least one recipient is required");
        }

        const emailRequest: SendEmailRequest = {
          to: toRecipients
        };

        // Template or custom content
        if (args?.templateId) {
          emailRequest.templateId = args.templateId as number;
        } else {
          if (!args?.subject || !args?.htmlContent) {
            throw new Error("Subject and htmlContent are required when not using a template");
          }
          emailRequest.subject = args.subject as string;
          emailRequest.htmlContent = args.htmlContent as string;
          if (args?.textContent) {
            emailRequest.textContent = args.textContent as string;
          }
        }

        // Sender
        if (args?.senderEmail) {
          emailRequest.sender = {
            email: args.senderEmail as string,
            name: args?.senderName as string | undefined
          };
        }

        // Reply-to
        if (args?.replyToEmail) {
          emailRequest.replyTo = { email: args.replyToEmail as string };
        }

        // Template params
        if (args?.params) {
          emailRequest.params = args.params as Record<string, string>;
        }

        // Tags
        if (args?.tags) {
          emailRequest.tags = args.tags as string[];
        }

        const result = await postBrevoAPI<{ messageId: string }>("/smtp/email", emailRequest);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: result.messageId,
                recipients: toRecipients.map(r => r.email),
                templateId: args?.templateId || null,
                message: `Email successfully sent to ${toRecipients.length} recipient(s)`
              }, null, 2)
            }
          ]
        };
      }

      case "send_template_email": {
        const templateId = args?.templateId as number;
        const toRecipients = args?.to as Recipient[];
        
        if (!templateId) {
          throw new Error("templateId is required");
        }
        if (!toRecipients || toRecipients.length === 0) {
          throw new Error("At least one recipient is required");
        }

        const emailRequest: SendEmailRequest = {
          templateId,
          to: toRecipients
        };

        if (args?.params) {
          emailRequest.params = args.params as Record<string, string>;
        }

        if (args?.tags) {
          emailRequest.tags = args.tags as string[];
        }

        const result = await postBrevoAPI<{ messageId: string }>("/smtp/email", emailRequest);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                messageId: result.messageId,
                templateId,
                recipients: toRecipients.map(r => r.email),
                message: `Template ${templateId} successfully sent to ${toRecipients.length} recipient(s)`
              }, null, 2)
            }
          ]
        };
      }

      // ========================================
      // ===== STATISTICS & EVENTS HANDLERS =====
      // ========================================
      case "get_transactional_events": {
        const params: Record<string, string> = {};
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.startDate) params.startDate = args.startDate as string;
        if (args?.endDate) params.endDate = args.endDate as string;
        if (args?.email) params.email = args.email as string;
        if (args?.event) params.event = args.event as string;
        if (args?.tags) params.tags = args.tags as string;
        if (args?.templateId) params.templateId = String(args.templateId);
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<TransactionalEventsResponse>("/smtp/statistics/events", params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_transactional_stats": {
        const params: Record<string, string> = {};
        
        if (args?.startDate && args?.endDate) {
          params.startDate = args.startDate as string;
          params.endDate = args.endDate as string;
        } else {
          const days = (args?.days as number) || 7;
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);
          params.startDate = startDate.toISOString().split('T')[0];
          params.endDate = endDate.toISOString().split('T')[0];
        }
        
        if (args?.tag) params.tag = args.tag as string;

        const result = await fetchBrevoAPI<{ reports: TransactionalStats[] }>("/smtp/statistics/reports", params);
        
        // Calculate totals
        const totals = result.reports.reduce((acc, day) => ({
          requests: acc.requests + day.requests,
          delivered: acc.delivered + day.delivered,
          opened: acc.opened + (day.opened || 0),
          clicked: acc.clicked + (day.clicked || 0),
          hardBounces: acc.hardBounces + day.hardBounces,
          softBounces: acc.softBounces + day.softBounces,
          blocked: acc.blocked + day.blocked,
          unsubscribed: acc.unsubscribed + day.unsubscribed,
          complaints: acc.complaints + (day.complaints || 0),
        }), {
          requests: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          hardBounces: 0,
          softBounces: 0,
          blocked: 0,
          unsubscribed: 0,
          complaints: 0
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                period: { start: params.startDate, end: params.endDate },
                totals,
                dailyStats: result.reports
              }, null, 2)
            }
          ]
        };
      }

      case "get_email_activity": {
        const email = args?.email as string;
        if (!email) {
          throw new Error("Email address is required");
        }

        const params: Record<string, string> = {
          email,
          limit: "100"
        };
        if (args?.startDate) params.startDate = args.startDate as string;
        if (args?.endDate) params.endDate = args.endDate as string;

        const result = await fetchBrevoAPI<TransactionalEventsResponse>("/smtp/statistics/events", params);
        
        // Group events by type
        const summary: Record<string, number> = {};
        result.events.forEach(event => {
          summary[event.event] = (summary[event.event] || 0) + 1;
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                email,
                summary,
                totalEvents: result.events.length,
                events: result.events
              }, null, 2)
            }
          ]
        };
      }

      // ========================================
      // ===== TEMPLATE HANDLERS =====
      // ========================================
      case "get_transactional_templates": {
        const params: Record<string, string> = {};
        if (args?.templateStatus !== undefined) params.templateStatus = String(args.templateStatus);
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);

        const result = await fetchBrevoAPI<{ templates: unknown[] }>("/smtp/templates", params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_template_details": {
        const templateId = args?.templateId as number;
        if (!templateId) {
          throw new Error("templateId is required");
        }

        const result = await fetchBrevoAPI<unknown>(`/smtp/templates/${templateId}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      // ========================================
      // ===== BLOCKED CONTACTS & SENDERS =====
      // ========================================
      case "get_blocked_contacts": {
        const params: Record<string, string> = {};
        if (args?.startDate) params.startDate = args.startDate as string;
        if (args?.endDate) params.endDate = args.endDate as string;
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<{ contacts: unknown[] }>("/smtp/blockedContacts", params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_senders": {
        const result = await fetchBrevoAPI<{ senders: unknown[] }>("/senders");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      // ========================================
      // ===== CONTACT MANAGEMENT HANDLERS =====
      // ========================================
      case "get_contacts": {
        const params: Record<string, string> = {};
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.modifiedSince) params.modifiedSince = args.modifiedSince as string;
        if (args?.createdSince) params.createdSince = args.createdSince as string;
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<{ contacts: Contact[], count: number }>("/contacts", params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                totalCount: result.count,
                contacts: result.contacts
              }, null, 2)
            }
          ]
        };
      }

      case "get_contact_info": {
        const identifier = args?.identifier as string;
        if (!identifier) {
          throw new Error("Contact identifier is required");
        }

        const identifierType = (args?.identifierType as string) || "email";
        const encodedIdentifier = encodeURIComponent(identifier);
        
        const params: Record<string, string> = {};
        if (args?.startDate) params.startDate = args.startDate as string;
        if (args?.endDate) params.endDate = args.endDate as string;

        let endpoint = `/contacts/${encodedIdentifier}`;
        if (identifierType !== "email") {
          params.identifierType = identifierType === "id" ? "id" : 
                                  identifierType === "phone" ? "phone_id" :
                                  identifierType === "ext_id" ? "ext_id" : "email_id";
        }

        const result = await fetchBrevoAPI<Contact>(endpoint, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "create_contact": {
        const email = args?.email as string;
        if (!email) {
          throw new Error("Email address is required");
        }

        const body: Record<string, unknown> = {
          email
        };

        if (args?.attributes) body.attributes = args.attributes;
        if (args?.listIds) body.listIds = args.listIds;
        if (args?.emailBlacklisted !== undefined) body.emailBlacklisted = args.emailBlacklisted;
        if (args?.smsBlacklisted !== undefined) body.smsBlacklisted = args.smsBlacklisted;
        if (args?.updateEnabled !== undefined) body.updateEnabled = args.updateEnabled;
        if (args?.smtpBlacklistSender) body.smtpBlacklistSender = args.smtpBlacklistSender;

        const result = await postBrevoAPI<{ id: number }>("/contacts", body);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                contactId: result.id,
                email,
                message: `Contact ${email} successfully created`
              }, null, 2)
            }
          ]
        };
      }

      case "update_contact": {
        const identifier = args?.identifier as string;
        if (!identifier) {
          throw new Error("Contact identifier is required");
        }

        const identifierType = (args?.identifierType as string) || "email";
        const encodedIdentifier = encodeURIComponent(identifier);

        const body: Record<string, unknown> = {};
        if (args?.attributes) body.attributes = args.attributes;
        if (args?.emailBlacklisted !== undefined) body.emailBlacklisted = args.emailBlacklisted;
        if (args?.smsBlacklisted !== undefined) body.smsBlacklisted = args.smsBlacklisted;
        if (args?.listIds) body.listIds = args.listIds;
        if (args?.unlinkListIds) body.unlinkListIds = args.unlinkListIds;
        if (args?.smtpBlacklistSender) body.smtpBlacklistSender = args.smtpBlacklistSender;

        let endpoint = `/contacts/${encodedIdentifier}`;
        if (identifierType !== "email") {
          const typeMap: Record<string, string> = {
            "id": "id",
            "phone": "phone_id",
            "ext_id": "ext_id"
          };
          endpoint += `?identifierType=${typeMap[identifierType] || "email_id"}`;
        }

        await putBrevoAPI(endpoint, body);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                identifier,
                message: `Contact ${identifier} successfully updated`
              }, null, 2)
            }
          ]
        };
      }

      case "delete_contact": {
        const identifier = args?.identifier as string;
        if (!identifier) {
          throw new Error("Contact identifier is required");
        }

        const identifierType = (args?.identifierType as string) || "email";
        const encodedIdentifier = encodeURIComponent(identifier);

        let endpoint = `/contacts/${encodedIdentifier}`;
        if (identifierType !== "email") {
          const typeMap: Record<string, string> = {
            "id": "id",
            "phone": "phone_id",
            "ext_id": "ext_id"
          };
          endpoint += `?identifierType=${typeMap[identifierType] || "email_id"}`;
        }

        await deleteBrevoAPI(endpoint);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                identifier,
                message: `Contact ${identifier} has been permanently deleted`
              }, null, 2)
            }
          ]
        };
      }

      case "get_contact_stats": {
        const identifier = args?.identifier as string;
        if (!identifier) {
          throw new Error("Contact identifier is required");
        }

        const identifierType = (args?.identifierType as string) || "email";
        const encodedIdentifier = encodeURIComponent(identifier);

        const params: Record<string, string> = {};
        if (args?.startDate) params.startDate = args.startDate as string;
        if (args?.endDate) params.endDate = args.endDate as string;

        let endpoint = `/contacts/${encodedIdentifier}/campaignStats`;
        if (identifierType !== "email") {
          const typeMap: Record<string, string> = {
            "id": "id",
            "phone": "phone_id",
            "ext_id": "ext_id"
          };
          params.identifierType = typeMap[identifierType] || "email_id";
        }

        const result = await fetchBrevoAPI<unknown>(endpoint, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      // ========================================
      // ===== LIST MANAGEMENT HANDLERS =====
      // ========================================
      case "get_lists": {
        const params: Record<string, string> = {};
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<{ lists: ContactList[], count: number }>("/contacts/lists", params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                totalCount: result.count,
                lists: result.lists
              }, null, 2)
            }
          ]
        };
      }

      case "get_list": {
        const listId = args?.listId as number;
        if (!listId) {
          throw new Error("listId is required");
        }

        const params: Record<string, string> = {};
        if (args?.startDate) params.startDate = args.startDate as string;
        if (args?.endDate) params.endDate = args.endDate as string;

        const result = await fetchBrevoAPI<ContactList>(`/contacts/lists/${listId}`, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_contacts_from_list": {
        const listId = args?.listId as number;
        if (!listId) {
          throw new Error("listId is required");
        }

        const params: Record<string, string> = {};
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.modifiedSince) params.modifiedSince = args.modifiedSince as string;
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<{ contacts: Contact[], count: number }>(`/contacts/lists/${listId}/contacts`, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                listId,
                totalCount: result.count,
                contacts: result.contacts
              }, null, 2)
            }
          ]
        };
      }

      case "create_list": {
        const name = args?.name as string;
        const folderId = args?.folderId as number;
        
        if (!name) {
          throw new Error("List name is required");
        }
        if (!folderId) {
          throw new Error("folderId is required (use 1 for root folder)");
        }

        const result = await postBrevoAPI<{ id: number }>("/contacts/lists", { name, folderId });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                listId: result.id,
                name,
                folderId,
                message: `List '${name}' successfully created`
              }, null, 2)
            }
          ]
        };
      }

      case "update_list": {
        const listId = args?.listId as number;
        if (!listId) {
          throw new Error("listId is required");
        }

        const body: Record<string, unknown> = {};
        if (args?.name) body.name = args.name;
        if (args?.folderId) body.folderId = args.folderId;

        await putBrevoAPI(`/contacts/lists/${listId}`, body);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                listId,
                message: `List ${listId} successfully updated`
              }, null, 2)
            }
          ]
        };
      }

      case "delete_list": {
        const listId = args?.listId as number;
        if (!listId) {
          throw new Error("listId is required");
        }

        await deleteBrevoAPI(`/contacts/lists/${listId}`);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                listId,
                message: `List ${listId} has been deleted. Contacts in the list were NOT deleted.`
              }, null, 2)
            }
          ]
        };
      }

      case "add_contacts_to_list": {
        const listId = args?.listId as number;
        if (!listId) {
          throw new Error("listId is required");
        }

        const body: Record<string, unknown> = {};
        if (args?.emails) body.emails = args.emails;
        if (args?.ids) body.ids = args.ids;

        if (!args?.emails && !args?.ids) {
          throw new Error("Either emails or ids must be provided");
        }

        await postBrevoAPI(`/contacts/lists/${listId}/contacts/add`, body);
        
        const count = (args?.emails as string[] || []).length + (args?.ids as number[] || []).length;
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                listId,
                contactsAdded: count,
                message: `${count} contact(s) added to list ${listId}`
              }, null, 2)
            }
          ]
        };
      }

      case "remove_contacts_from_list": {
        const listId = args?.listId as number;
        if (!listId) {
          throw new Error("listId is required");
        }

        const body: Record<string, unknown> = {};
        if (args?.emails) body.emails = args.emails;
        if (args?.ids) body.ids = args.ids;

        if (!args?.emails && !args?.ids) {
          throw new Error("Either emails or ids must be provided");
        }

        await postBrevoAPI(`/contacts/lists/${listId}/contacts/remove`, body);
        
        const count = (args?.emails as string[] || []).length + (args?.ids as number[] || []).length;
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                listId,
                contactsRemoved: count,
                message: `${count} contact(s) removed from list ${listId}. Contacts were NOT deleted.`
              }, null, 2)
            }
          ]
        };
      }

      // ========================================
      // ===== FOLDER MANAGEMENT HANDLERS =====
      // ========================================
      case "get_folders": {
        const params: Record<string, string> = {};
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<{ folders: unknown[], count: number }>("/contacts/folders", params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                totalCount: result.count,
                folders: result.folders
              }, null, 2)
            }
          ]
        };
      }

      case "get_folder_lists": {
        const folderId = args?.folderId as number;
        if (!folderId) {
          throw new Error("folderId is required");
        }

        const params: Record<string, string> = {};
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<{ lists: ContactList[], count: number }>(`/contacts/folders/${folderId}/lists`, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                folderId,
                totalCount: result.count,
                lists: result.lists
              }, null, 2)
            }
          ]
        };
      }

      case "create_folder": {
        const name = args?.name as string;
        if (!name) {
          throw new Error("Folder name is required");
        }

        const result = await postBrevoAPI<{ id: number }>("/contacts/folders", { name });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                folderId: result.id,
                name,
                message: `Folder '${name}' successfully created`
              }, null, 2)
            }
          ]
        };
      }

      case "update_folder": {
        const folderId = args?.folderId as number;
        const name = args?.name as string;
        
        if (!folderId) {
          throw new Error("folderId is required");
        }
        if (!name) {
          throw new Error("New folder name is required");
        }

        await putBrevoAPI(`/contacts/folders/${folderId}`, { name });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                folderId,
                name,
                message: `Folder ${folderId} renamed to '${name}'`
              }, null, 2)
            }
          ]
        };
      }

      case "delete_folder": {
        const folderId = args?.folderId as number;
        if (!folderId) {
          throw new Error("folderId is required");
        }

        await deleteBrevoAPI(`/contacts/folders/${folderId}`);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                folderId,
                message: `Folder ${folderId} has been deleted. Lists were moved to the root folder.`
              }, null, 2)
            }
          ]
        };
      }

      // ========================================
      // ===== CAMPAIGN HANDLERS =====
      // ========================================
      case "get_campaigns": {
        const params: Record<string, string> = {};
        if (args?.type) params.type = args.type as string;
        if (args?.status) params.status = args.status as string;
        if (args?.statistics) params.statistics = args.statistics as string;
        if (args?.startDate) params.startDate = args.startDate as string;
        if (args?.endDate) params.endDate = args.endDate as string;
        if (args?.limit) params.limit = String(args.limit);
        if (args?.offset) params.offset = String(args.offset);
        if (args?.sort) params.sort = args.sort as string;

        const result = await fetchBrevoAPI<{ campaigns: Campaign[]; count: number }>("/emailCampaigns", params);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              totalCount: result.count,
              campaigns: result.campaigns.map(c => ({
                id: c.id,
                name: c.name,
                subject: c.subject,
                status: c.status,
                scheduledAt: c.scheduledAt,
                sentDate: c.sentDate,
                createdAt: c.createdAt,
                statistics: c.statistics?.globalStats
              }))
            }, null, 2)
          }]
        };
      }

      case "get_campaign": {
        const campaignId = args?.campaignId as number;
        if (!campaignId) throw new Error("campaignId is required");

        const params: Record<string, string> = {};
        if (args?.statistics) params.statistics = args.statistics as string;

        const result = await fetchBrevoAPI<Campaign>(`/emailCampaigns/${campaignId}`, params);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case "create_campaign": {
        const name = args?.name as string;
        const subject = args?.subject as string;
        const senderEmail = args?.senderEmail as string;
        const listIds = args?.listIds as number[];

        if (!name) throw new Error("name is required");
        if (!subject) throw new Error("subject is required");
        if (!senderEmail) throw new Error("senderEmail is required");
        if (!listIds || listIds.length === 0) throw new Error("listIds is required");

        const body: CreateCampaignBody = {
          name,
          subject,
          type: "classic",
          sender: {
            email: senderEmail,
            name: (args?.senderName as string) || senderEmail,
          },
          recipients: {
            listIds,
            ...(args?.exclusionListIds ? { exclusionListIds: args.exclusionListIds as number[] } : {})
          }
        };

        if (args?.senderId) body.sender.id = args.senderId as number;
        if (args?.templateId) body.templateId = args.templateId as number;
        else if (args?.htmlContent) body.htmlContent = args.htmlContent as string;
        else if (args?.htmlUrl) body.htmlUrl = args.htmlUrl as string;
        if (args?.scheduledAt) body.scheduledAt = args.scheduledAt as string;
        if (args?.replyTo) body.replyTo = args.replyTo as string;
        if (args?.toField) body.toField = args.toField as string;
        if (args?.previewText) body.previewText = args.previewText as string;

        const result = await postBrevoAPI<{ id: number }>("/emailCampaigns", body);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              campaignId: result.id,
              name,
              message: `Campaign '${name}' created with ID ${result.id}. Use send_campaign_now or schedule_campaign to send it.`
            }, null, 2)
          }]
        };
      }

      case "update_campaign": {
        const campaignId = args?.campaignId as number;
        if (!campaignId) throw new Error("campaignId is required");

        const body: Record<string, unknown> = {};
        if (args?.name) body.name = args.name;
        if (args?.subject) body.subject = args.subject;
        if (args?.senderEmail || args?.senderName || args?.senderId) {
          body.sender = {
            ...(args?.senderEmail ? { email: args.senderEmail } : {}),
            ...(args?.senderName ? { name: args.senderName } : {}),
            ...(args?.senderId ? { id: args.senderId } : {}),
          };
        }
        if (args?.templateId) body.templateId = args.templateId;
        else if (args?.htmlContent) body.htmlContent = args.htmlContent;
        if (args?.listIds || args?.exclusionListIds) {
          body.recipients = {
            ...(args?.listIds ? { listIds: args.listIds } : {}),
            ...(args?.exclusionListIds ? { exclusionListIds: args.exclusionListIds } : {}),
          };
        }
        if (args?.scheduledAt) body.scheduledAt = args.scheduledAt;
        if (args?.replyTo) body.replyTo = args.replyTo;
        if (args?.previewText) body.previewText = args.previewText;

        await putBrevoAPI(`/emailCampaigns/${campaignId}`, body);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              campaignId,
              message: `Campaign ${campaignId} successfully updated`
            }, null, 2)
          }]
        };
      }

      case "send_campaign_now": {
        const campaignId = args?.campaignId as number;
        if (!campaignId) throw new Error("campaignId is required");

        await postBrevoAPI(`/emailCampaigns/${campaignId}/sendNow`, {});
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              campaignId,
              message: `Campaign ${campaignId} is now being sent to all recipients`
            }, null, 2)
          }]
        };
      }

      case "schedule_campaign": {
        const campaignId = args?.campaignId as number;
        const scheduledAt = args?.scheduledAt as string;
        if (!campaignId) throw new Error("campaignId is required");
        if (!scheduledAt) throw new Error("scheduledAt is required (ISO 8601 format)");

        await putBrevoAPI(`/emailCampaigns/${campaignId}/schedule`, { scheduledAt });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              campaignId,
              scheduledAt,
              message: `Campaign ${campaignId} scheduled for ${scheduledAt}`
            }, null, 2)
          }]
        };
      }

      case "send_campaign_test": {
        const campaignId = args?.campaignId as number;
        const emailTo = args?.emailTo as string[];
        if (!campaignId) throw new Error("campaignId is required");
        if (!emailTo || emailTo.length === 0) throw new Error("emailTo is required");

        await postBrevoAPI(`/emailCampaigns/${campaignId}/sendTest`, { emailTo });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              campaignId,
              testSentTo: emailTo,
              message: `Test email for campaign ${campaignId} sent to: ${emailTo.join(", ")}`
            }, null, 2)
          }]
        };
      }

      case "delete_campaign": {
        const campaignId = args?.campaignId as number;
        if (!campaignId) throw new Error("campaignId is required");

        await deleteBrevoAPI(`/emailCampaigns/${campaignId}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              campaignId,
              message: `Campaign ${campaignId} has been deleted`
            }, null, 2)
          }]
        };
      }

      // ========================================
      // ===== ATTRIBUTES HANDLERS =====
      // ========================================
      case "get_attributes": {
        const result = await fetchBrevoAPI<{ attributes: unknown[] }>("/contacts/attributes");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
});

  return server;
}
