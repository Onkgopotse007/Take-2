#!/usr/bin/env bash
# Admin deploy from this Mac: builds the arm64 images, copies them straight to the VM and applies
# the manifests. Normal releases happen automatically on merge to development
# (.github/workflows/deploy.yml); use this when the Kubernetes setup itself changes, or if
# GitHub is unavailable. Only ever touches the take2 namespace and take2 images.
set -euo pipefail

HOST="${TAKE2_HOST:-ubuntu@140.238.81.209}"
KEY="${TAKE2_SSH_KEY:-$HOME/.ssh/instapula_uk}"
cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit or stash your changes first, so the deployed tag matches a commit." >&2
  exit 1
fi
TAG="$(git rev-parse HEAD)"
REPO=ghcr.io/onkgopotse007
remote() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

echo "==> Building $REPO/take2-server:$TAG and take2-web (linux/arm64)"
docker build --platform linux/arm64 -f deploy/server.Dockerfile -t "$REPO/take2-server:$TAG" .
docker build --platform linux/arm64 -f deploy/web.Dockerfile -t "$REPO/take2-web:$TAG" .

echo "==> Copying images to the VM"
docker save "$REPO/take2-server:$TAG" "$REPO/take2-web:$TAG" | gzip | remote 'gunzip | sudo k3s ctr images import -'

echo "==> Applying manifests"
remote 'sudo k3s kubectl apply -f -' < deploy/k8s/bootstrap.yaml
sed "s/IMAGE_TAG/$TAG/g" deploy/k8s/take2.yaml | remote 'sudo k3s kubectl apply -f -'
remote 'sudo k3s kubectl -n take2 rollout status deploy/take2-server --timeout=180s &&
        sudo k3s kubectl -n take2 rollout status deploy/take2-web --timeout=180s'

echo "==> Removing old take2 images on the VM"
remote "sudo k3s ctr images ls -q | grep -E '^(docker.io/library|ghcr.io/onkgopotse007)/take2-(server|web):' | grep -v ':$TAG\$' | xargs -r sudo k3s ctr images rm" || true

echo "==> Checking"
remote 'curl -fsS -o /dev/null -w "web: HTTP %{http_code}\n" http://localhost/ && curl -fsS http://localhost/api/healthz && echo'
echo "Deployed $TAG."
