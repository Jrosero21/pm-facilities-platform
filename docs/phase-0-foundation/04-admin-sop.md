# Phase 0 — Admin / Internal SOP

Phase 0 has no application admin workflows. The only "admin" surface is the developer workflow for spinning up a session and verifying the project foundation.

## SOP-0.1 — Open a session against the live DB

Run in a terminal:

```bash
ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com
```

In a second terminal:

```bash
cd ~/Desktop/PM 2>/dev/null || cd ~/Desktop/pm
read -s MYSQL_PWD
export MYSQL_PWD
mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm \
  -e "SELECT DATABASE() AS db_name, NOW() AS server_time;"
```

Never paste the password inline. Never put it in shell history.

## SOP-0.2 — Verify Phase 0 state

```bash
cd ~/Desktop/PM
git status
git branch --show-current        # expect: phase-0-foundation
git tag -l                       # expect: v0.1.0-phase-0
ls docs/roadmap/                 # expect: 01-gpt-project-roadmap.md
ls docs/phase-0-foundation/      # expect: 01-…-11-…
```

## SOP-0.3 — Take a pre-phase snapshot (optional, before Phase 1)

```bash
cd ~/Desktop
rsync -a \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  PM/ PM_snapshot_v0_1_0_phase_0/
```

## Application admin SOPs
**N/A for Phase 0.** Real admin/internal workflows (tenant admin, user management, dispatch console, etc.) begin in Phase 1 and grow each phase.
