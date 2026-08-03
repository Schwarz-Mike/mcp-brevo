# MCP Brevo Server

## Projektübersicht

**Name:** mcp-brevo-transactional  
**Version:** 3.0.0  
**Zweck:** MCP Server für Brevo - Kontakt-Management, Listen, Ordner & Transaktionale E-Mails  
**Erstellt:** Januar 2026  
**Autor:** Mike Schwarz / Claude AI  

---

## Verzeichnisstruktur

```
mcp-brevo-transactional/
├── build/                    # Kompilierter JavaScript-Code
│   └── index.js              # Hauptdatei (generiert durch npm run build)
├── node_modules/             # Dependencies
├── src/                      # TypeScript Quellcode
│   └── index.ts              # Hauptdatei
├── package.json              # NPM Konfiguration
├── package-lock.json         # Dependency Lock
├── tsconfig.json             # TypeScript Konfiguration
├── README.md                 # Kurzanleitung
└── MCP-Server.md             # Diese Dokumentation
```

---

## Installation

### Voraussetzungen
- Node.js v18+ installiert
- Brevo Account mit API-Key

### Schritte

```powershell
cd "C:\Program Files\mcp-servers\mcp-brevo-transactional"
npm install
npm run build
```

### Claude Desktop Konfiguration

Datei: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "brevo-transactional": {
      "command": "node",
      "args": ["C:\\Program Files\\mcp-servers\\mcp-brevo-transactional\\build\\index.js"],
      "env": {
        "BREVO_API_KEY": "xkeysib-DEIN-API-KEY"
      }
    }
  }
}
```

---

## Verfügbare Tools

### 📤 E-MAIL VERSAND

#### send_email
Sendet eine transaktionale E-Mail mit eigenem Inhalt oder Template.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| to | Array | ✅ | Empfänger [{email, name?}] |
| subject | String | ❌* | Betreff (*Pflicht ohne Template) |
| htmlContent | String | ❌* | HTML-Inhalt (*Pflicht ohne Template) |
| textContent | String | ❌ | Plaintext-Fallback |
| templateId | Number | ❌ | Brevo Template-ID |
| params | Object | ❌ | Template-Variablen {KEY: "value"} |
| senderEmail | String | ❌ | Absender-E-Mail (muss verifiziert sein) |
| senderName | String | ❌ | Absender-Name |
| replyToEmail | String | ❌ | Reply-To Adresse |
| tags | Array | ❌ | Tags für Tracking ["tag1", "tag2"] |

**Beispiel:**
```json
{
  "to": [{"email": "empfaenger@example.com", "name": "Max"}],
  "subject": "Hallo!",
  "htmlContent": "<h1>Willkommen</h1><p>Dies ist ein Test.</p>",
  "senderEmail": "mike.schwarz@hypnosetherapie.pro",
  "senderName": "Mike Schwarz"
}
```

---

#### send_template_email
Vereinfachtes Senden mit Template.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| templateId | Number | ✅ | Brevo Template-ID |
| to | Array | ✅ | Empfänger [{email, name?}] |
| params | Object | ❌ | Template-Variablen |
| tags | Array | ❌ | Tags für Tracking |

**Beispiel:**
```json
{
  "templateId": 386,
  "to": [{"email": "kunde@example.com"}],
  "params": {"FIRSTNAME": "Anna", "LASTNAME": "Müller"}
}
```

---

### 📊 STATISTIKEN & EVENTS

#### get_transactional_events
Ruft E-Mail-Events ab (delivered, opened, clicked, bounced, etc.)

**Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| limit | Number | Anzahl Events (max 100) |
| offset | Number | Pagination Start |
| startDate | String | Startdatum YYYY-MM-DD |
| endDate | String | Enddatum YYYY-MM-DD |
| email | String | Filter nach Empfänger |
| event | String | Event-Typ: delivered, opened, clicked, softBounces, hardBounces, blocked, spam, invalid, deferred, unsubscribed |
| tags | String | Filter nach Tag |
| templateId | Number | Filter nach Template |
| sort | String | asc oder desc |

---

#### get_transactional_stats
Aggregierte Statistiken für einen Zeitraum.

**Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| startDate | String | Startdatum YYYY-MM-DD |
| endDate | String | Enddatum YYYY-MM-DD |
| days | Number | Alternativ: Anzahl Tage zurück (Standard: 7) |
| tag | String | Filter nach Tag |

**Rückgabe:**
- Totals (requests, delivered, opened, clicked, bounces, etc.)
- Daily Stats pro Tag

---

#### get_email_activity
Alle E-Mail-Aktivitäten für eine bestimmte Adresse.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| email | String | ✅ | E-Mail-Adresse |
| startDate | String | ❌ | Startdatum |
| endDate | String | ❌ | Enddatum |

---

### 📋 TEMPLATES

#### get_transactional_templates
Listet alle transaktionalen Templates auf.

**Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| templateStatus | Boolean | true=aktiv, false=inaktiv |
| limit | Number | Anzahl (Standard: 50) |
| offset | Number | Pagination Start |

---

#### get_template_details
Details eines spezifischen Templates.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| templateId | Number | ✅ | Template-ID |

---

### 🚫 BLOCKIERUNGEN & SENDER

#### get_blocked_contacts
Liste blockierter/abgemeldeter Kontakte.

**Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| startDate | String | Startdatum |
| endDate | String | Enddatum |
| limit | Number | Anzahl |
| offset | Number | Pagination |
| sort | String | asc oder desc |

---

#### get_senders
Liste aller verifizierten Absender.

**Parameter:** Keine

---

### 👤 KONTAKT-MANAGEMENT

#### get_contacts
Liste aller Kontakte mit Pagination.

**Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| limit | Number | Anzahl pro Seite (max 1000, Standard: 50) |
| offset | Number | Pagination Start |
| modifiedSince | String | Nur Kontakte geändert nach diesem Datum (YYYY-MM-DD oder ISO) |
| createdSince | String | Nur Kontakte erstellt nach diesem Datum |
| sort | String | asc oder desc |

**Beispiel:**
```json
{
  "limit": 100,
  "modifiedSince": "2025-01-01"
}
```

---

#### get_contact_info
Detaillierte Informationen über einen Kontakt inkl. Attribute, Listen und Statistiken.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| identifier | String | ✅ | E-Mail, Telefon oder Kontakt-ID |
| identifierType | String | ❌ | "email" (Standard), "phone", "id", "ext_id" |
| startDate | String | ❌ | Startdatum für Kampagnen-Statistiken |
| endDate | String | ❌ | Enddatum für Kampagnen-Statistiken |

**Beispiel:**
```json
{
  "identifier": "kunde@example.com",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

---

#### create_contact
Erstellt einen neuen Kontakt.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| email | String | ✅ | E-Mail-Adresse |
| attributes | Object | ❌ | Kontaktattribute z.B. {"FIRSTNAME": "Max", "LASTNAME": "Mustermann"} |
| listIds | Array | ❌ | Listen-IDs zum Hinzufügen [1, 2, 3] |
| emailBlacklisted | Boolean | ❌ | E-Mail-Blacklist (Standard: false) |
| smsBlacklisted | Boolean | ❌ | SMS-Blacklist (Standard: false) |
| updateEnabled | Boolean | ❌ | Bei true: Update wenn Kontakt existiert |
| smtpBlacklistSender | Array | ❌ | Absender-E-Mails blockieren |

**Beispiel:**
```json
{
  "email": "neuer.kunde@example.com",
  "attributes": {
    "FIRSTNAME": "Anna",
    "LASTNAME": "Schmidt",
    "SMS": "+49151234567"
  },
  "listIds": [5, 12]
}
```

---

#### update_contact
Aktualisiert einen bestehenden Kontakt.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| identifier | String | ✅ | E-Mail, Telefon oder Kontakt-ID |
| identifierType | String | ❌ | "email", "phone", "id", "ext_id" |
| attributes | Object | ❌ | Attribute zum Aktualisieren |
| emailBlacklisted | Boolean | ❌ | E-Mail-Blacklist setzen |
| smsBlacklisted | Boolean | ❌ | SMS-Blacklist setzen |
| listIds | Array | ❌ | Listen zum Hinzufügen |
| unlinkListIds | Array | ❌ | Listen zum Entfernen |
| smtpBlacklistSender | Array | ❌ | Absender blockieren |

**Beispiel:**
```json
{
  "identifier": "kunde@example.com",
  "attributes": {
    "FIRSTNAME": "Maximilian"
  },
  "listIds": [8],
  "unlinkListIds": [5]
}
```

---

#### delete_contact
Löscht einen Kontakt permanent. **ACHTUNG: Nicht rückgängig machbar!**

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| identifier | String | ✅ | E-Mail, Telefon oder Kontakt-ID |
| identifierType | String | ❌ | "email", "phone", "id", "ext_id" |

---

#### get_contact_stats
Kampagnen-Statistiken für einen Kontakt (Opens, Clicks, etc.)

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| identifier | String | ✅ | E-Mail, Telefon oder Kontakt-ID |
| identifierType | String | ❌ | "email", "phone", "id", "ext_id" |
| startDate | String | ❌ | Startdatum für Statistiken |
| endDate | String | ❌ | Enddatum für Statistiken |

---

### 📁 LISTEN-MANAGEMENT

#### get_lists
Alle Kontaktlisten mit Statistiken.

**Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| limit | Number | Anzahl pro Seite (max 50) |
| offset | Number | Pagination Start |
| sort | String | asc oder desc |

---

#### get_list
Details einer spezifischen Liste.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| listId | Number | ✅ | Listen-ID |
| startDate | String | ❌ | Startdatum für Kampagnen-Stats |
| endDate | String | ❌ | Enddatum für Kampagnen-Stats |

---

#### get_contacts_from_list
Alle Kontakte einer Liste abrufen.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| listId | Number | ✅ | Listen-ID |
| limit | Number | ❌ | Anzahl pro Seite (max 500) |
| offset | Number | ❌ | Pagination Start |
| modifiedSince | String | ❌ | Filter nach Änderungsdatum |
| sort | String | ❌ | asc oder desc |

**Beispiel:**
```json
{
  "listId": 12,
  "limit": 200
}
```

---

#### create_list
Neue Liste erstellen.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| name | String | ✅ | Name der Liste |
| folderId | Number | ✅ | Ordner-ID (1 = Hauptordner) |

**Beispiel:**
```json
{
  "name": "Newsletter Abonnenten 2026",
  "folderId": 1
}
```

---

#### update_list
Liste umbenennen oder verschieben.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| listId | Number | ✅ | Listen-ID |
| name | String | ❌ | Neuer Name |
| folderId | Number | ❌ | Neuer Ordner |

---

#### delete_list
Liste löschen. **Kontakte werden NICHT gelöscht!**

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| listId | Number | ✅ | Listen-ID |

---

#### add_contacts_to_list
Kontakte zu einer Liste hinzufügen.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| listId | Number | ✅ | Listen-ID |
| emails | Array | ❌* | E-Mail-Adressen (*oder ids) |
| ids | Array | ❌* | Kontakt-IDs (*oder emails) |

**Beispiel:**
```json
{
  "listId": 12,
  "emails": ["kunde1@example.com", "kunde2@example.com"]
}
```

---

#### remove_contacts_from_list
Kontakte aus einer Liste entfernen. **Kontakte werden NICHT gelöscht!**

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| listId | Number | ✅ | Listen-ID |
| emails | Array | ❌* | E-Mail-Adressen (*oder ids) |
| ids | Array | ❌* | Kontakt-IDs (*oder emails) |

---

### 📂 ORDNER-MANAGEMENT

#### get_folders
Alle Ordner für Listen abrufen.

**Parameter:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| limit | Number | Anzahl pro Seite |
| offset | Number | Pagination Start |
| sort | String | asc oder desc |

---

#### get_folder_lists
Alle Listen in einem Ordner.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| folderId | Number | ✅ | Ordner-ID |
| limit | Number | ❌ | Anzahl pro Seite |
| offset | Number | ❌ | Pagination Start |
| sort | String | ❌ | asc oder desc |

---

#### create_folder
Neuen Ordner erstellen.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| name | String | ✅ | Ordnername |

---

#### update_folder
Ordner umbenennen.

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| folderId | Number | ✅ | Ordner-ID |
| name | String | ✅ | Neuer Name |

---

#### delete_folder
Ordner löschen. **Listen werden in Hauptordner verschoben!**

**Parameter:**
| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| folderId | Number | ✅ | Ordner-ID |

---

### 🏷️ ATTRIBUTE

#### get_attributes
Alle Kontaktattribute (Custom Fields) des Accounts.

**Parameter:** Keine

**Rückgabe:** Liste aller definierten Attribute mit Typ und Kategorie.

---

## Brevo API Referenz

**Base URL:** `https://api.brevo.com/v3`

**Verwendete Endpoints:**

### Transaktionale E-Mails
- POST `/smtp/email` - E-Mail senden
- GET `/smtp/statistics/events` - Events abrufen
- GET `/smtp/statistics/reports` - Aggregierte Stats
- GET `/smtp/templates` - Templates auflisten
- GET `/smtp/templates/{id}` - Template Details
- GET `/smtp/blockedContacts` - Blockierte Kontakte
- GET `/senders` - Absender auflisten

### Kontakte
- GET `/contacts` - Kontakte auflisten
- POST `/contacts` - Kontakt erstellen
- GET `/contacts/{identifier}` - Kontakt-Details
- PUT `/contacts/{identifier}` - Kontakt aktualisieren
- DELETE `/contacts/{identifier}` - Kontakt löschen
- GET `/contacts/{identifier}/campaignStats` - Kontakt-Statistiken
- GET `/contacts/attributes` - Attribute auflisten

### Listen
- GET `/contacts/lists` - Listen auflisten
- POST `/contacts/lists` - Liste erstellen
- GET `/contacts/lists/{listId}` - Liste Details
- PUT `/contacts/lists/{listId}` - Liste aktualisieren
- DELETE `/contacts/lists/{listId}` - Liste löschen
- GET `/contacts/lists/{listId}/contacts` - Kontakte in Liste
- POST `/contacts/lists/{listId}/contacts/add` - Kontakte hinzufügen
- POST `/contacts/lists/{listId}/contacts/remove` - Kontakte entfernen

### Ordner
- GET `/contacts/folders` - Ordner auflisten
- POST `/contacts/folders` - Ordner erstellen
- GET `/contacts/folders/{folderId}` - Ordner Details
- PUT `/contacts/folders/{folderId}` - Ordner aktualisieren
- DELETE `/contacts/folders/{folderId}` - Ordner löschen
- GET `/contacts/folders/{folderId}/lists` - Listen im Ordner

**Authentifizierung:** Header `api-key: {BREVO_API_KEY}`

---

## Changelog

### v3.0.0 (11.01.2026)
**Kontakt-Management:**
- ✨ NEU: `get_contacts` - Alle Kontakte mit Pagination abrufen
- ✨ NEU: `get_contact_info` - Kontaktdetails inkl. Statistiken
- ✨ NEU: `create_contact` - Neuen Kontakt erstellen
- ✨ NEU: `update_contact` - Kontakt aktualisieren
- ✨ NEU: `delete_contact` - Kontakt permanent löschen
- ✨ NEU: `get_contact_stats` - Kampagnen-Statistiken pro Kontakt

**Listen-Management:**
- ✨ NEU: `get_lists` - Alle Listen abrufen
- ✨ NEU: `get_list` - Listen-Details
- ✨ NEU: `get_contacts_from_list` - Kontakte einer Liste
- ✨ NEU: `create_list` - Neue Liste erstellen
- ✨ NEU: `update_list` - Liste aktualisieren
- ✨ NEU: `delete_list` - Liste löschen
- ✨ NEU: `add_contacts_to_list` - Kontakte zu Liste hinzufügen
- ✨ NEU: `remove_contacts_from_list` - Kontakte aus Liste entfernen

**Ordner-Management:**
- ✨ NEU: `get_folders` - Alle Ordner abrufen
- ✨ NEU: `get_folder_lists` - Listen in Ordner
- ✨ NEU: `create_folder` - Ordner erstellen
- ✨ NEU: `update_folder` - Ordner umbenennen
- ✨ NEU: `delete_folder` - Ordner löschen

**Attribute:**
- ✨ NEU: `get_attributes` - Kontaktattribute abrufen

**Technische Verbesserungen:**
- 🔧 Hinzufügung von PUT und DELETE API-Methoden
- 🔧 Verbesserte Fehlerbehandlung für 204 No Content Responses
- 🔧 Code-Strukturierung mit klaren Kategorien

### v2.0.0 (11.01.2026)
- ✨ NEU: `send_email` - E-Mails mit eigenem Inhalt versenden
- ✨ NEU: `send_template_email` - E-Mails mit Template versenden
- ✨ NEU: `get_template_details` - Template-Details abrufen
- ✨ NEU: `get_senders` - Verifizierte Absender auflisten
- 🔧 Verbesserte Fehlerbehandlung

### v1.0.0 (11.01.2026)
- 🎉 Initiale Version
- Statistik-Funktionen (Events, Stats, Activity)
- Template-Liste
- Blockierte Kontakte

---

## Geplante Erweiterungen

### v3.1.0 (geplant)
**Kampagnen-Management:**
- [ ] `get_campaigns` - Kampagnen auflisten
- [ ] `get_campaign_details` - Kampagnen-Details
- [ ] `create_campaign` - Neue Kampagne erstellen
- [ ] `update_campaign` - Kampagne bearbeiten
- [ ] `send_campaign` - Kampagne senden
- [ ] `send_test_campaign` - Test-E-Mail senden
- [ ] `get_campaign_stats` - Kampagnen-Statistiken

### v3.2.0 (geplant)
- [ ] Template erstellen/bearbeiten/löschen
- [ ] Webhook-Management
- [ ] Bounce-Handling (Kontakte reaktivieren)
- [ ] Import/Export von Kontakten

---

## Troubleshooting

### Server startet nicht
```
Error: Cannot find module '...\build\index.js'
```
**Lösung:** `npm run build` ausführen

### API Key Fehler
```
Brevo API error: 401 - {"message":"Key not found"}
```
**Lösung:** API-Key in claude_desktop_config.json prüfen

### E-Mail wird nicht gesendet
```
Brevo API error: 400 - {"message":"sender not found"}
```
**Lösung:** Absender-E-Mail muss in Brevo verifiziert sein

### Kontakt nicht gefunden
```
Brevo API error: 404 - {"message":"Contact does not exist"}
```
**Lösung:** E-Mail-Adresse prüfen oder mit `identifierType` den Typ angeben

### Liste nicht löschbar
```
Brevo API error: 400 - {"message":"List cannot be deleted"}
```
**Lösung:** Liste enthält möglicherweise aktive Automationen. In Brevo prüfen.

---

## Kontakt & Support

**Entwickelt für:** Mike Schwarz / Hypnosetherapie.pro  
**MCP Server Pfad:** `C:\Program Files\mcp-servers\mcp-brevo-transactional`  
**Entwicklungsordner:** `C:\Users\ich\Dropbox\mike\MCP Servers\mcp-brevo-transactional`
