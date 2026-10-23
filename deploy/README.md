# Deploying Take 2

The game runs on the shared k3s cluster on the Oracle VM, entirely in the `take2` namespace.

## Releases are automatic

**`development` is live.** Every merge to it runs `.github/workflows/deploy.yml`:

1. **CI:** typecheck, tests and the client build.
2. **Images:** builds `take2-server` and `take2-web` for arm64 on GitHub's ARM runners and pushes them to `ghcr.io/onkgopotse007/…:<commit>`.
3. **Release (the `production` environment):** logs in to the VM as `take2-deploy` and runs `release <commit>`. That user's key can run nothing else. The VM pulls both images first and only then switches the deployments, so a failed download leaves the game running.
4. **Check:** fetches the live site and `/api/healthz`.

Each release appears under **Deployments** on the repo's front page (environment `production`). To release again without a new merge, use **Actions → Deploy → Run workflow**.

Releases end games in progress (tables live in the server's memory), so merge when nobody is mid-game.

## Admin deploys

`deploy/deploy.sh` builds on this Mac, copies the images straight to the VM and applies `deploy/k8s/bootstrap.yaml` and `deploy/k8s/take2.yaml`. Use it when the Kubernetes setup itself changes (automatic releases only change image tags), or if GitHub is unavailable. Commit first: it refuses uncommitted changes.

## The deploy user (one-off)

`deploy/vm/setup-deploy-user.sh` creates `take2-deploy` on the VM: a locked account whose SSH key is forced to run `take2-release`, which can only `sudo take2-pull` (pull the two take2 images) and use the `take2-deployer` service account (read and patch deployments in `take2`, nothing else). The private key lives only in the `production` environment's `DEPLOY_SSH_KEY` secret on GitHub, with the VM's host key in `DEPLOY_KNOWN_HOSTS`.

## What runs

| Deployment | What | Notes |
| --- | --- | --- |
| `take2-server` | Colyseus game server, one bundled file on Node 22 | One replica only: tables live in memory, so a deploy ends games in progress. |
| `take2-web` | Caddy with the built client | `hostPort` 80 and 443. Forwards `/api/*` (HTTP and WebSockets) to the server, serves everything else from `/srv`. |

## Adding a domain later

1. Point the domain's A record at `140.238.81.209`.
2. In `deploy/k8s/take2.yaml`, set `SITE_ADDRESS` to the domain (for example `take2.example.com`) and redeploy.
3. Caddy gets and renews the certificate by itself (stored on the `take2-caddy-data` volume). The installable app and AdSense then work too.

## Firewall

Both must allow TCP 80 and 443 before the game is reachable from outside:

- **VM iptables (done):** ACCEPT rules for 80 and 443 sit before the final REJECT, both live and in `/etc/iptables/rules.v4`. Do not use `netfilter-persistent save`: it would also save k3s's live KUBE-* rules and restore stale ones on reboot. Edit `rules.v4` directly.
- **Oracle console:** ingress rules for TCP 80 and 443 on the security list of VCN `instapula-uk` (source `0.0.0.0/0`).

## Useful commands

```sh
ssh -i ~/.ssh/instapula_uk ubuntu@140.238.81.209
sudo k3s kubectl -n take2 get pods
sudo k3s kubectl -n take2 logs deploy/take2-server --tail=50
sudo k3s kubectl -n take2 rollout restart deploy/take2-server
```
