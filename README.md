# MCP Brevo Server

Ein Model Context Protocol (MCP) Server für Brevo (ehemals Sendinblue).

## Features

- 📤 **E-Mail-Versand** - Transaktionale E-Mails mit Templates oder eigenem Inhalt
- 👤 **Kontakt-Management** - Erstellen, Lesen, Aktualisieren, Löschen
- 📁 **Listen-Management** - Listen erstellen, Kontakte hinzufügen/entfernen
- 📂 **Ordner-Management** - Listen organisieren
- 📊 **Statistiken** - E-Mail-Events und aggregierte Statistiken

## Quick Start

```bash
npm install
npm run build
```

## Konfiguration (Claude Desktop)

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

## Dokumentation

Siehe [MCP-Server.md](MCP-Server.md) für vollständige Dokumentation aller Tools.

## Version

v3.0.0 - Kontakt- & Listen-Management
