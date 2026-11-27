# aria-links — the Aria Links CLI

Aria Links from your terminal: one named short link per placement, and a
real-click count that tells you exactly which placement earned the tap.
Verified real clicks only — bots and scanners are filtered out, never
counted.

## Install

One command (installs Homebrew first if your Mac doesn't have it):

```sh
curl -fsSL https://raw.githubusercontent.com/techytonys/homebrew-tap/main/install.sh | bash
```

Already have Homebrew? This works too:

```sh
brew install techytonys/tap/aria-links
```

Then save your API key (find it in the Aria Links app, Settings → API keys):

```sh
aria-links login
```

Your key is stored in `~/.config/aria-links/config.json` (chmod 600) — it
never leaves your machine except to call the Aria Links API.

## Commands

```
aria-links new "Name" <url>      Create a link, prints its short URL
aria-links list [--all]          Your links, most verified clicks first
aria-links clicks <code>         Verified clicks + recent activity for a link
aria-links folders               Your folders with link counts
aria-links analyze <code>        Aria's read + checklist for a link (1 credit)
aria-links balance               Your credit balance
aria-links archive <code>        Archive a link
aria-links unarchive <code>      Bring an archived link back
```

## Notes

- Click counts follow the app's rule: a click counts only after it passes
  verification (~a minute), and your own visits are excluded while
  "Block my visits" is on.
- `ARIA_LINKS_API_KEY` in the environment overrides the saved key.
