# Deployment

How the public demo at https://d3vo9j7lhnrych.cloudfront.net runs, how to
build it again from nothing, and how to take it down without leaving
anything that bills.

The instance has no key pair and no backups on purpose: if it breaks, it is
replaced by following this document, and the guest saves on it are lost.
That makes this document the recovery plan, so it is kept to what was
actually set up.

## Shape

```
Browser ──HTTPS──▶ CloudFront  (*.cloudfront.net)
                       │  HTTP :3001, accepted only from CloudFront's addresses
                       ▼
                 EC2 t4g.micro, Sydney  (Ubuntu 24.04 arm64, Elastic IP)
                   compose.yaml
                     app  ── image from GHCR
                     db   ── postgres:17, port not published

GitHub Actions fd-image ──push──▶ GHCR ──pull──▶ EC2
```

- **One instance runs the same `compose.yaml` as local development.** The app
  container and PostgreSQL run side by side; there is no managed database.
  A load balancer alone would cost more each month than the instance.
- **The server never builds.** A `t4g.micro` has 1 GiB of memory, so CI
  builds the arm64 image on an arm runner and the server only pulls it. The
  package on GHCR is public, so pulling needs no login.
- **CloudFront provides HTTPS** on its own domain, so no domain name or
  certificate had to be bought. The guest cookie is `Secure` in production
  and would not be sent over plain HTTP.

## Settings

### EC2

| Setting | Value |
|---|---|
| Region | `ap-southeast-2` (Sydney) |
| Instance type | `t4g.micro`, credit specification **Standard** (throttles instead of billing for extra CPU) |
| AMI | Ubuntu Server 24.04 LTS, arm64 |
| Disk | gp3, 20 GB |
| Key pair | none — shell access is EC2 Instance Connect in the browser |
| Public IPv4 | Elastic IP, so the address survives a stop and start |

### Security group

| Port | Source | Why |
|---|---|---|
| 22 | prefix list `com.amazonaws.ap-southeast-2.ec2-instance-connect` | browser shell only, not the internet |
| 3001 | prefix list `com.amazonaws.global.cloudfront.origin-facing` | only CloudFront reaches the app |

Nothing else is open. Port 3001 is published by compose on the instance, but
a request to it from anywhere other than CloudFront times out. That was
checked from outside, and it is also what makes the next setting safe.

### `.env` on the instance

```
POSTGRES_PASSWORD=<openssl rand -hex 24>
TIME_SCALE=10
TRUST_PROXY_HOPS=1
```

`chmod 600`, never committed. `TIME_SCALE=10` makes crops grow ten times
faster than their design times, so a visitor sees a harvest within minutes.

`TRUST_PROXY_HOPS=1` tells Express to trust one proxy in front of it.
CloudFront adds the visitor's address to the end of `X-Forwarded-For`, and
the guest rate limit (five per IP per hour) counts that address instead of
CloudFront's. Without it, every visitor would share CloudFront's addresses
and one busy hour would lock everyone out. Checked by reaching the limit from
one network while a phone on another network could still create a guest.
The setting is only safe because port 3001 accepts CloudFront alone — anyone
able to reach the app directly could write their own `X-Forwarded-For`.

### CloudFront

| Setting | Value |
|---|---|
| Origin | the Elastic IP's public DNS name, `ec2-<address-with-dashes>.ap-southeast-2.compute.amazonaws.com` (CloudFront needs a name, not an IP) |
| Origin protocol | HTTP only, port 3001 |
| Pricing | pay as you go, no WAF |

| Behavior | Methods | Cache policy | Origin request policy |
|---|---|---|---|
| Default (`*`) | GET, HEAD | `CachingOptimized` | none |
| `/api/*` | all | `CachingDisabled` | `AllViewerExceptHostHeader` |

Viewers on HTTP are redirected to HTTPS. `/api/*` forwards cookies, query
strings and headers, because every game route depends on the guest cookie
and none of its answers may be cached. The default behavior caches the
built client, but Express sends `Cache-Control: public, max-age=0`, so
CloudFront keeps a file only for the policy's one-second minimum. Measured:
only a request repeated within that second comes back as a `Hit`.

### Guest cleanup (cron)

Guests unseen for 30 days are deleted on the 1st of every month at
03:00 UTC (the instance's clock is UTC). This is the `ubuntu` user's crontab,
one line:

```
0 3 1 * * cd /home/ubuntu/farmdelve && { date; docker compose exec -T db psql -U farmdelve -d farmdelve < server/db/cleanup-guests.sql; } >> /home/ubuntu/cleanup-guests.log 2>&1
```

- `-T` because cron has no terminal; without it compose refuses with
  `cannot attach stdin to a TTY-enabled container because stdin is not a terminal`.
- psql inside the container connects over the Unix socket, which the
  `postgres` image trusts, so no password appears here.
- `date` is left without a format on purpose: `%` in a crontab line is
  read as a newline.

Checked on 2026-11-25 by scheduling it every minute, moving one player's
`last_seen_at` back 31 days, and seeing `DELETE 1` in the log while the
other seven players stayed.

## Building it again

1. Launch the instance with the settings above and attach the security group.
2. Connect with EC2 Instance Connect and install Docker Engine with the
   Compose plugin from Docker's own apt repository, following
   [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
   Add `ubuntu` to the `docker` group and reconnect.
3. `git clone https://github.com/Artemis3753/farmdelve.git ~/farmdelve`
   — the server needs `compose.yaml` and the two SQL files the database
   loads on its first start.
4. Write `~/farmdelve/.env` as above.
5. Start it. `--no-build` because `compose.yaml` also has `build: .` for
   local development:
   ```bash
   cd ~/farmdelve
   docker compose pull app
   docker compose up -d --no-build
   curl localhost:3001/api/health
   ```
6. Allocate an Elastic IP and associate it with the instance.
7. Create the CloudFront distribution with the settings above.
8. Add the crontab line with `crontab -e`.

## Shipping a new version

Deploys are manual. After a merge to `main` and a green `fd-image` run:

```bash
cd ~/farmdelve
git pull
docker compose pull app
docker compose up -d --no-build
```

`git pull` matters only when `compose.yaml` or the SQL files changed. A
change to `schema.sql` does **not** reach the running database: the schema
loads only into an empty data volume, and there are no migrations, so
applying it means `docker compose down -v` and losing every guest save.

## Taking it down

Not run yet. In this order:

1. **CloudFront** — disable the distribution, wait until it shows as
   deployed, then delete it. A distribution cannot be deleted while enabled.
2. **EC2** — terminate the instance. Its 20 GB disk goes with it: the
   instance's Storage tab shows *Delete on termination* as `Yes`, checked
   2026-11-25. The guest saves on that disk go with it too.
3. **Elastic IP** — release it. Terminating the instance only detaches it,
   and a public IPv4 address is billed by the hour whether or not it is
   attached to anything.
4. **Security group** — delete it; it cannot be deleted while an instance
   still uses it.

Optional: the GHCR package and the billing budget cost nothing and can stay.
Afterwards, check EC2 → Elastic IPs and EC2 → Volumes in Sydney are empty.
