#!/usr/bin/env node
/*
 * aria-links — the Aria Links command-line tool.
 *
 * One named short link per placement, verified real clicks
 * only — the same rules as the Aria Links app, from your
 * terminal. Talks to the Aria Links API with your personal
 * API key (alk_…), the key the app's Settings → API keys
 * screen and the Zapier connect use.
 *
 * Your key lives in ~/.config/aria-links/config.json
 * (chmod 600) — never in this file. Set it once with:
 *
 *     aria-links login
 *
 * No dependencies. Node 18+.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const API_BASE =
  process.env.ARIA_LINKS_API_BASE ||
  "https://rqesrbingluxyludjtrh.supabase.co/functions/v1";
const CONFIG_DIR = path.join(os.homedir(), ".config", "aria-links");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ── config ────────────────────────────────────────────────

function readConfigKey() {
  if (process.env.ARIA_LINKS_API_KEY) return process.env.ARIA_LINKS_API_KEY;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const cfg = JSON.parse(raw);
    return typeof cfg.api_key === "string" ? cfg.api_key : null;
  } catch {
    return null;
  }
}

function saveConfigKey(key) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ api_key: key }, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.chmodSync(CONFIG_FILE, 0o600);
}

// ── api ───────────────────────────────────────────────────

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

async function api(key, method, route, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    fail("could not reach the Aria Links API — check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (res.ok) return data;
  const code = data && typeof data.error === "string" ? data.error : "";
  if (res.status === 401 || code === "invalid_api_key" || code === "unauthorized") {
    fail("your API key was rejected. Run `aria-links login` with a valid key.");
  }
  if (code === "link_not_found") fail("no link with that code on your account.");
  if (code === "no_credits") fail("you're out of credits — grab a pack in the Aria Links app (Settings → Tokens).");
  if (code === "placement_name_required") fail("a placement name is required.");
  if (code === "destination_url_invalid") fail("that destination URL doesn't look valid.");
  fail(`the API said no (${code || res.status}).`);
}

function needKey() {
  const key = readConfigKey();
  if (!key) {
    fail("no API key saved. Run `aria-links login` first (your key is in the Aria Links app, Settings → API keys).");
  }
  return key;
}

// ── formatting ────────────────────────────────────────────

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── commands ──────────────────────────────────────────────

async function cmdLogin(argKey) {
  let key = argKey;
  if (!key && process.stdin.isTTY) {
    key = await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("Paste your Aria Links API key (alk_…): ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  } else if (!key) {
    // piped stdin
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    key = Buffer.concat(chunks).toString("utf8").trim().split(/\s+/)[0];
  }
  if (!key || !/^alk_[A-Za-z0-9]+$/.test(key)) {
    fail("that doesn't look like an Aria Links API key (they start with alk_).");
  }
  // Prove it works before saving.
  await api(key, "GET", "/al-api/credits");
  saveConfigKey(key);
  console.log("Saved. You're signed in — try `aria-links list`.");
}

async function cmdNew(name, dest) {
  const key = needKey();
  if (!name || !dest) fail('usage: aria-links new "Placement name" https://destination');
  const link = await api(key, "POST", "/al-api/links", {
    placement_name: name,
    destination_url: dest,
  });
  console.log(`${link.short_url}`);
  console.log(`  ${link.placement_name} → ${link.destination_url}`);
}

async function cmdList(showAll) {
  const key = needKey();
  const data = await api(key, "GET", "/al-api/links");
  let links = data.links || [];
  if (!showAll) links = links.filter((l) => !l.archived);
  links.sort((a, b) => b.real_clicks - a.real_clicks);
  if (links.length === 0) {
    console.log(showAll ? "No links yet." : "No links yet — create one with `aria-links new`.");
    return;
  }
  console.log(`${pad("PLACEMENT", 34)} ${pad("CODE", 9)} ${pad("VERIFIED CLICKS", 16)} FILTERED`);
  for (const l of links) {
    const name = l.placement_name.length > 33 ? l.placement_name.slice(0, 32) + "…" : l.placement_name;
    console.log(
      `${pad(name, 34)} ${pad(l.code, 9)} ${pad(l.real_clicks, 16)} ${l.filtered_clicks}${l.archived ? "  (archived)" : ""}`,
    );
  }
}

async function cmdClicks(code) {
  const key = needKey();
  if (!code) fail("usage: aria-links clicks <code>");
  const link = await api(key, "GET", `/al-api/links/${encodeURIComponent(code)}`);
  const data = await api(key, "GET", `/al-api/links/${encodeURIComponent(code)}/clicks?limit=10`);
  console.log(`${link.placement_name} (${link.code}) — ${link.short_url}`);
  console.log(`Verified real clicks: ${data.count}`);
  if (data.clicks && data.clicks.length > 0) {
    console.log("Most recent:");
    for (const c of data.clicks) {
      const where = c.country_name || c.country_code || "unknown";
      const device = c.device_label || "";
      console.log(`  ${when(c.clicked_at)}  ${where}${device ? `  ${device}` : ""}`);
    }
  }
}

async function cmdFolders() {
  const key = needKey();
  const data = await api(key, "GET", "/al-api/folders");
  const folders = data.folders || [];
  if (folders.length === 0) {
    console.log("No folders yet — folders are created in the Aria Links app.");
    return;
  }
  for (const f of folders) {
    console.log(`${f.name} — ${f.link_count} link${f.link_count === 1 ? "" : "s"}`);
  }
}

async function cmdAnalyze(code) {
  const key = needKey();
  if (!code) fail("usage: aria-links analyze <code>");
  const link = await api(key, "GET", `/al-api/links/${encodeURIComponent(code)}`);
  console.log(`Analyzing ${link.placement_name} (${link.code}) — 1 credit…`);
  const data = await api(key, "POST", "/al-analyze", { link_id: link.id });
  const a = data.analysis || {};
  console.log("");
  console.log(a.body || "(no read returned)");
  const steps = data.steps || [];
  if (steps.length > 0) {
    console.log("");
    console.log("Her checklist:");
    for (const s of steps) {
      console.log(`  ${s.position}. ${s.text}`);
      if (s.why) console.log(`     Why: ${s.why}`);
      if (s.words) console.log(`     Words: ${s.words}`);
      if (s.needs_build) console.log("     (needs a build — Tony can help with this one)");
    }
  }
}

async function cmdBalance() {
  const key = needKey();
  const data = await api(key, "GET", "/al-api/credits");
  console.log(`Credit balance: ${data.balance}`);
}

async function cmdArchive(code, archived) {
  const key = needKey();
  if (!code) fail(`usage: aria-links ${archived ? "archive" : "unarchive"} <code>`);
  const data = await api(key, "PATCH", `/al-api/links/${encodeURIComponent(code)}`, { archived });
  console.log(`${data.code} ${data.archived ? "archived" : "unarchived"}.`);
}

function help() {
  console.log(`aria-links — Aria Links from your terminal
One named short link per placement. Verified real clicks only.

Usage:
  aria-links login                 Save your API key (app → Settings → API keys)
  aria-links new "Name" <url>      Create a link, prints its short URL
  aria-links list [--all]          Your links, most verified clicks first
                                   (--all includes archived links)
  aria-links clicks <code>         Verified clicks + recent activity for a link
  aria-links folders               Your folders with link counts
  aria-links analyze <code>        Aria's read + checklist for a link (1 credit)
  aria-links balance               Your credit balance
  aria-links archive <code>        Archive a link
  aria-links unarchive <code>      Bring an archived link back
  aria-links --help                This help`);
}

// ── main ──────────────────────────────────────────────────

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "login":
      return cmdLogin(rest[0]);
    case "new":
      return cmdNew(rest[0], rest[1]);
    case "list":
      return cmdList(rest.includes("--all"));
    case "clicks":
      return cmdClicks(rest[0]);
    case "folders":
      return cmdFolders();
    case "analyze":
      return cmdAnalyze(rest[0]);
    case "balance":
      return cmdBalance();
    case "archive":
      return cmdArchive(rest[0], true);
    case "unarchive":
      return cmdArchive(rest[0], false);
    case "--help":
    case "-h":
    case "help":
    case undefined:
      return help();
    default:
      console.error(`Unknown command: ${cmd}\n`);
      help();
      process.exit(2);
  }
}

main().catch((e) => fail(e && e.message ? e.message : "something went wrong."));
