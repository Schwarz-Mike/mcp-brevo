"use strict";
// Server-rendered HTML: login, OAuth consent, and the admin dashboard.
// Client-side JS uses string concatenation (never ${}) to avoid clashing
// with the server-side template literals.

import type { UserRow, TenantRow } from "./db.js";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;margin:0;padding:0;color:#111}
  .card{background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.1);max-width:400px;margin:70px auto;padding:36px}
  .logo{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8a94a6;margin-bottom:10px}
  h2{margin:0 0 20px;font-size:22px}
  label{display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:4px;margin-top:12px}
  input,select{width:100%;padding:9px 12px;border:1px solid #ddd;border-radius:5px;font-size:15px;background:#fff}
  input:focus,select:focus{outline:none;border-color:#0b7285;box-shadow:0 0 0 3px rgba(11,114,133,.15)}
  button{cursor:pointer}
  button.primary{width:100%;padding:11px;background:#0b7285;color:#fff;border:none;border-radius:5px;font-size:15px;font-weight:600;margin-top:20px}
  button.primary:hover{background:#095a68}
  .error{background:#fff0f0;border:1px solid #fcc;color:#c00;padding:9px 12px;border-radius:5px;font-size:13px;margin-bottom:12px}
  .hint{color:#888;font-size:12px;margin-top:12px;text-align:center}
  a{color:#0b7285}
`;

export function renderLogin(): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Brevo MCP — Anmelden</title>
<style>${CSS}</style></head><body>
<div class="card">
  <div class="logo">Brevo MCP Connector</div>
  <h2>Anmelden</h2>
  <div class="error" id="error" style="display:none">Ungültiger Benutzername oder Passwort.</div>
  <form method="POST" action="/oauth/login" id="loginForm">
    <input type="hidden" name="next" id="nextField" value="">
    <label for="username">Benutzername</label>
    <input id="username" name="username" type="text" required autofocus autocomplete="username">
    <label for="password">Passwort</label>
    <input id="password" name="password" type="password" required autocomplete="current-password">
    <button type="submit" class="primary">Anmelden</button>
  </form>
</div>
<script>
  var params=new URLSearchParams(location.search);
  if(params.get('error'))document.getElementById('error').style.display='block';
  var n=params.get('next');
  if(n)document.getElementById('nextField').value=n;
</script>
</body></html>`;
}

export function renderAuthorize(tenantLabel: string | null): string {
  const target = tenantLabel
    ? `dein <b>Brevo-Konto „${esc(tenantLabel)}"</b>`
    : `deine <b>Brevo-Konnektoren</b>`;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Brevo MCP — Zugriff erlauben</title>
<style>${CSS}
  .scopes{background:#f8f9fa;border-radius:6px;padding:14px 16px;margin:16px 0;list-style:none}
  .scopes li{font-size:13px;color:#444;margin:6px 0}
  .scopes li::before{content:'✓ ';color:#2e8b57;font-weight:bold}
  .actions{display:flex;gap:10px;margin-top:22px}
  .actions button{flex:1;padding:11px;border:none;border-radius:5px;font-size:14px;font-weight:600}
  .allow{background:#0b7285;color:#fff}.allow:hover{background:#095a68}
  .deny{background:#f0f0f0;color:#333}.deny:hover{background:#e2e2e2}
</style></head><body>
<div class="card">
  <div class="logo">Brevo MCP Connector</div>
  <h2>Zugriff erlauben</h2>
  <p style="color:#555;font-size:14px;line-height:1.6"><b>Claude</b> möchte über diesen Connector auf ${target} zugreifen.</p>
  <ul class="scopes">
    <li>Brevo-Tools ausführen (E-Mails, Kontakte, Listen, Kampagnen)</li>
    <li>Anfragen in deinem Namen senden</li>
    <li>Zugriff jederzeit im Admin-Dashboard widerrufbar</li>
  </ul>
  <form method="POST" action="/oauth/authorize">
    <div class="actions">
      <button type="submit" class="allow">Zugriff erlauben</button>
      <button type="button" class="deny" onclick="history.back()">Ablehnen</button>
    </div>
  </form>
</div>
</body></html>`;
}

// ------------------------------------------------------------------
// Admin dashboard
// ------------------------------------------------------------------

export function renderAdmin(
  adminUser: string,
  baseUrl: string,
  users: UserRow[],
  tenants: TenantRow[]
): string {
  const userById: Record<number, UserRow> = {};
  users.forEach((u) => (userById[u.id] = u));

  const tenantRows =
    tenants
      .map((t) => {
        const owner = userById[t.owner_user_id];
        const url = `${baseUrl}/${t.name}`;
        const last = t.last_called_at
          ? new Date(t.last_called_at).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })
          : "—";
        return `<tr id="trow-${t.id}">
      <td><code>${esc(t.name)}</code></td>
      <td style="color:#555">${esc(t.label)}</td>
      <td>${esc(owner ? owner.username : "?")}</td>
      <td style="font-size:11px;white-space:nowrap"><code>${esc(url)}</code>
        <button type="button" onclick="copyUrl('${esc(url)}')" title="URL kopieren" style="border:1px solid #ddd;border-radius:3px;background:#fff;font-size:11px;padding:2px 6px">📋</button></td>
      <td style="font-size:11px;white-space:nowrap">${last}</td>
      <td style="text-align:right;font-size:11px">${t.call_count}</td>
      <td style="white-space:nowrap">
        <button type="button" onclick="testTenant(${t.id})" style="font-size:12px;padding:3px 8px;background:#eef6f8;border:1px solid #a7d3dc;border-radius:4px">Key testen</button>
        <button type="button" onclick="toggleEditTenant(${t.id})" style="font-size:12px;padding:3px 8px;background:#eef;border:1px solid #99c;border-radius:4px">Bearbeiten</button>
        <button type="button" onclick="delTenant(${t.id},'${esc(t.name)}')" style="font-size:12px;padding:3px 10px;background:#fff0f0;border:1px solid #fcc;border-radius:4px;color:#c00">Löschen</button>
      </td>
    </tr>
    <tr id="etrow-${t.id}" style="display:none;background:#fafaff"><td colspan="7" style="padding:12px 16px">
      <b style="font-size:12px">„${esc(t.name)}" bearbeiten</b>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0">
        <div><label style="margin:0">Label</label><input id="et-label-${t.id}" value="${esc(t.label)}"></div>
        <div><label style="margin:0">Owner</label><select id="et-owner-${t.id}">${users
          .map((u) => `<option value="${u.id}"${u.id === t.owner_user_id ? " selected" : ""}>${esc(u.username)}</option>`)
          .join("")}</select></div>
      </div>
      <label style="margin:0">Neuer Brevo-Key <span style="font-weight:normal;color:#888">(leer = unverändert)</span></label>
      <input id="et-key-${t.id}" type="password" placeholder="xkeysib-…">
      <button type="button" onclick="saveTenant(${t.id})" style="margin-top:8px;font-size:12px;padding:6px 14px;background:#0b7285;color:#fff;border:none;border-radius:4px">Speichern</button>
      <button type="button" onclick="toggleEditTenant(${t.id})" style="font-size:12px;padding:6px 12px;background:#f0f0f0;border:1px solid #ccc;border-radius:4px;margin-left:4px">Abbrechen</button>
    </td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="7" style="color:#aaa;text-align:center;padding:20px">Noch keine Tenants. Lege unten einen an.</td></tr>';

  const userRows =
    users
      .map((u) => {
        const isAdminOwner = u.username === adminUser;
        return `<tr id="urow-${u.id}">
      <td>${esc(u.username)} ${isAdminOwner ? '<span style="font-size:10px;background:#ffd;border:1px solid #cc0;border-radius:3px;padding:1px 4px">du</span>' : ""}</td>
      <td>${esc(u.firstname)} ${esc(u.lastname)}</td>
      <td style="font-size:12px">${esc(u.email)}</td>
      <td>${esc(u.role)}</td>
      <td style="font-size:12px">${new Date(u.created_at).toLocaleDateString("de-CH")}</td>
      <td style="white-space:nowrap">
        <button type="button" onclick="togglePwd(${u.id})" style="font-size:12px;padding:3px 8px;background:#fffaf0;border:1px solid #f5c878;border-radius:4px">Passwort</button>
        ${isAdminOwner ? "" : `<button type="button" onclick="delUser(${u.id},'${esc(u.username)}')" style="font-size:12px;padding:3px 10px;background:#fff0f0;border:1px solid #fcc;border-radius:4px;color:#c00">Löschen</button>`}
      </td>
    </tr>
    <tr id="pwdrow-${u.id}" style="display:none;background:#fffaf0"><td colspan="6" style="padding:10px 16px">
      <b style="font-size:12px">Neues Passwort für ${esc(u.username)}:</b>
      <input id="pwd-${u.id}" type="text" style="width:260px;margin-left:8px;display:inline-block" placeholder="min. 8 Zeichen">
      <button type="button" onclick="savePwd(${u.id})" style="font-size:12px;padding:6px 12px;background:#0b7285;color:#fff;border:none;border-radius:4px;margin-left:6px">Setzen</button>
    </td></tr>`;
      })
      .join("") || "";

  const userOptions = users.map((u) => `<option value="${u.id}">${esc(u.username)}</option>`).join("");

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Brevo MCP — Admin</title>
<style>
${CSS}
  .wrap{max-width:1150px;margin:24px auto;padding:0 20px}
  nav{background:#fff;border-bottom:1px solid #e0e0e0;padding:0 24px;display:flex;align-items:center;height:54px}
  nav .brand{font-weight:700;font-size:15px;margin-right:auto}
  nav a{color:#0b7285;font-size:13px;margin-left:16px;text-decoration:none}
  .panel{background:#fff;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.08);padding:22px;margin-bottom:22px;max-width:none}
  h3{margin:0 0 14px;font-size:17px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:left;vertical-align:middle}
  th{font-weight:600;color:#555;background:#fafafa}
  code{background:#eef;padding:2px 5px;border-radius:3px;font-size:12px}
  .grid{display:grid;gap:10px}
  #alert{position:fixed;top:12px;right:12px;z-index:50}
  .toast{padding:10px 16px;border-radius:6px;font-size:13px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,.15)}
  .toast.ok{background:#e7f6ec;border:1px solid #a3d9b1;color:#1e7d34}
  .toast.err{background:#fdecec;border:1px solid #f0b4b4;color:#c0392b}
  .addbox{background:#f8fafb;border:1px dashed #cfd8dc;border-radius:6px;padding:14px;margin-top:12px}
  .addbox input,.addbox select{font-size:13px;padding:7px 9px}
  details summary{cursor:pointer;font-weight:600;font-size:13px;color:#0b7285}
</style></head><body>
<nav><div class="brand">Brevo MCP · Admin</div>
  <span style="font-size:13px;color:#555">Eingeloggt als <b>${esc(adminUser)}</b></span>
  <a href="/logout">Abmelden</a></nav>
<div id="alert"></div>
<div class="wrap">

  <div class="panel">
    <h3>Tenants (Brevo-Konten)</h3>
    <table>
      <thead><tr><th>Endpoint</th><th>Label</th><th>Owner</th><th>Connector-URL</th><th>Letzter Aufruf</th><th>#</th><th>Aktionen</th></tr></thead>
      <tbody>${tenantRows}</tbody>
    </table>
    <div class="addbox">
      <details><summary>+ Neuen Tenant anlegen</summary>
        <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px">
          <div><label style="margin:0">Endpoint-Name <span style="font-weight:normal;color:#888">(z.B. bienpur)</span></label><input id="nt-name" placeholder="bienpur"></div>
          <div><label style="margin:0">Label</label><input id="nt-label" placeholder="Brevo Bien Pur"></div>
          <div><label style="margin:0">Owner</label><select id="nt-owner">${userOptions}</select></div>
        </div>
        <label style="margin:8px 0 0">Brevo API-Key</label>
        <input id="nt-key" type="password" placeholder="xkeysib-…">
        <button type="button" class="primary" style="width:auto;margin-top:12px;padding:9px 20px" onclick="createTenant()">Tenant anlegen</button>
      </details>
    </div>
  </div>

  <div class="panel">
    <h3>Benutzer</h3>
    <table>
      <thead><tr><th>Benutzername</th><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Erstellt</th><th>Aktionen</th></tr></thead>
      <tbody>${userRows}</tbody>
    </table>
    <div class="addbox">
      <details><summary>+ Neuen Benutzer anlegen</summary>
        <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px">
          <div><label style="margin:0">Benutzername</label><input id="nu-username" placeholder="kunde1"></div>
          <div><label style="margin:0">Vorname</label><input id="nu-first"></div>
          <div><label style="margin:0">Nachname</label><input id="nu-last"></div>
        </div>
        <div class="grid" style="grid-template-columns:2fr 1fr 1fr;margin-top:8px">
          <div><label style="margin:0">E-Mail</label><input id="nu-email" type="email"></div>
          <div><label style="margin:0">Passwort</label><input id="nu-pwd" type="text" placeholder="min. 8 Zeichen"></div>
          <div><label style="margin:0">Rolle</label><select id="nu-role"><option value="user">user</option><option value="admin">admin</option></select></div>
        </div>
        <button type="button" class="primary" style="width:auto;margin-top:12px;padding:9px 20px" onclick="createUser()">Benutzer anlegen</button>
      </details>
    </div>
  </div>

  <div class="panel">
    <h3>Mit Claude verbinden</h3>
    <ol style="color:#444;font-size:14px;line-height:1.9">
      <li>Claude.ai öffnen → <b>Einstellungen</b> → <b>Konnektoren</b> → <b>Benutzerdefinierten Konnektor hinzufügen</b></li>
      <li>Namen vergeben und die Connector-URL des Tenants eintragen, z.B. <code>${esc(baseUrl)}/bienpur</code></li>
      <li>Claude öffnet ein Login-Popup → hier anmelden → <b>Zugriff erlauben</b></li>
    </ol>
  </div>
</div>
<script>
function toast(msg,ok){var a=document.getElementById('alert');var d=document.createElement('div');d.className='toast '+(ok?'ok':'err');d.textContent=msg;a.appendChild(d);setTimeout(function(){d.remove();},4000);}
function copyUrl(u){navigator.clipboard.writeText(u).then(function(){toast('URL kopiert!',true);});}
async function api(method,url,body){
  var r=await fetch(url,{method:method,credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:body?JSON.stringify(body):undefined});
  if(r.status===401){location.href='/login?next=/admin';return Promise.reject(new Error('reauth'));}
  var d=await r.json().catch(function(){return {};});
  if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
  return d;
}
function toggleEditTenant(id){var r=document.getElementById('etrow-'+id);r.style.display=r.style.display==='none'?'':'none';}
function togglePwd(id){var r=document.getElementById('pwdrow-'+id);r.style.display=r.style.display==='none'?'':'none';}
async function createTenant(){
  var body={name:val('nt-name'),label:val('nt-label'),owner_user_id:parseInt(val('nt-owner'),10),brevo_key:val('nt-key')};
  if(!body.name||!body.brevo_key){toast('Endpoint-Name und Brevo-Key sind Pflicht.',false);return;}
  try{await api('POST','/admin/tenants',body);toast('Tenant angelegt.',true);setTimeout(function(){location.reload();},700);}catch(e){toast(e.message,false);}
}
async function saveTenant(id){
  var body={label:val('et-label-'+id),owner_user_id:parseInt(val('et-owner-'+id),10)};
  var k=val('et-key-'+id);if(k)body.brevo_key=k;
  try{await api('PUT','/admin/tenants/'+id,body);toast('Gespeichert.',true);setTimeout(function(){location.reload();},700);}catch(e){toast(e.message,false);}
}
async function delTenant(id,name){
  if(!confirm('Tenant „'+name+'" wirklich löschen?'))return;
  try{await api('DELETE','/admin/tenants/'+id);document.getElementById('trow-'+id).remove();document.getElementById('etrow-'+id).remove();toast('Gelöscht.',true);}catch(e){toast(e.message,false);}
}
async function testTenant(id){
  try{var d=await api('POST','/admin/tenants/'+id+'/test');toast('Key OK — '+(d.company||d.email||'gültig'),true);}catch(e){toast('Key-Test fehlgeschlagen: '+e.message,false);}
}
async function createUser(){
  var body={username:val('nu-username'),firstname:val('nu-first'),lastname:val('nu-last'),email:val('nu-email'),password:val('nu-pwd'),role:val('nu-role')};
  if(!body.username||!body.password){toast('Benutzername und Passwort sind Pflicht.',false);return;}
  try{await api('POST','/admin/users',body);toast('Benutzer angelegt.',true);setTimeout(function(){location.reload();},700);}catch(e){toast(e.message,false);}
}
async function savePwd(id){
  var v=val('pwd-'+id);if(!v||v.length<8){toast('Passwort min. 8 Zeichen.',false);return;}
  try{await api('POST','/admin/users/'+id+'/password',{password:v});toast('Passwort gesetzt.',true);togglePwd(id);}catch(e){toast(e.message,false);}
}
async function delUser(id,name){
  if(!confirm('Benutzer „'+name+'" (inkl. seiner Tenants) wirklich löschen?'))return;
  try{await api('DELETE','/admin/users/'+id);location.reload();}catch(e){toast(e.message,false);}
}
function val(id){return document.getElementById(id).value.trim();}
</script>
</body></html>`;
}
