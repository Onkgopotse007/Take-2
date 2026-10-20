#!/usr/bin/env bash
# Builds the arm64 images on this Mac, copies them to the VM (no registry yet) and applies the
# take2 manifests. Only ever touches the take2 namespace and take2-* images.
set -euo pipefail

HOST="${TAKE2_HOST:-ubuntu@140.238.81.209}"
KEY="${TAKE2_SSH_KEY:-$HOME/.ssh/instapula_uk}"
cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit or stash your changes first, so the deployed tag matches a commit." >&2
  exit 1
fi
TAG="$(git rev-parse --short HEAD)"
remote() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

echo "==> Building take2-server:$TAG and take2-web:$TAG (linux/arm64)"
docker build --platform linux/arm64 -f deploy/server.Dockerfile -t "take2-server:$TAG" .
docker build --platform linux/arm64 -f deploy/web.Dockerfile -t "take2-web:$TAG" .

echo "==> Copying images to the VM"
docker save "take2-server:$TAG" "take2-web:$TAG" | gzip | remote 'gunzip | sudo k3s ctr images import -'

echo "==> Applying manifests"
sed "s/IMAGE_TAG/$TAG/g" deploy/k8s/take2.yaml | remote 'sudo k3s kubectl apply -f -'
remote 'sudo k3s kubectl -n take2 rollout status deploy/take2-server --timeout=180s &&
        sudo k3s kubectl -n take2 rollout status deploy/take2-web --timeout=180s'

echo "==> Removing old take2 images on the VM"
remote "sudo k3s ctr images ls -q | grep -E '^docker.io/library/take2-(server|web):' | grep -v ':$TAG\$' | xargs -r sudo k3s ctr images rm" || true

echo "==> Checking"
remote 'curl -fsS -o /dev/null -w "web: HTTP %{http_code}\n" http://localhost/ && curl -fsS http://localhost/api/healthz && echo'
echo "Deployed $TAG."
