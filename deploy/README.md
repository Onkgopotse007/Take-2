# Deploying Take 2

The game runs on the shared k3s cluster on the Oracle VM, entirely in the `take2` namespace.

```sh
deploy/deploy.sh
```

It builds `take2-server` and `take2-web` for linux/arm64 on this Mac, copies them to the VM with `docker save | k3s ctr images import` (no registry yet), applies `deploy/k8s/take2.yaml` with the commit as the image tag, waits for both rollouts, removes older take2 images and checks the site from the VM. Commit first: it refuses to deploy uncommitted changes.

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

- **VM iptables:** ACCEPT rules for 80 and 443 inserted before the final REJECT, saved with `sudo netfilter-persistent save`.
- **Oracle console:** ingress rules for TCP 80 and 443 on the security list of VCN `instapula-uk` (source `0.0.0.0/0`).

## Useful commands

```sh
ssh -i ~/.ssh/instapula_uk ubuntu@140.238.81.209
sudo k3s kubectl -n take2 get pods
sudo k3s kubectl -n take2 logs deploy/take2-server --tail=50
sudo k3s kubectl -n take2 rollout restart deploy/take2-server
```
