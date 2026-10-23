#!/usr/bin/env bash
# One-off admin setup on the VM, run with sudo. Safe to re-run.
# Creates the take2-deploy user that GitHub Actions logs in as. Its key can only run
# take2-release, which can only pull the take2 images and roll the take2 deployments.
#   sudo ./setup-deploy-user.sh "<ssh public key>"
set -euo pipefail
PUBKEY="${1:?public key required}"
USER_NAME=take2-deploy
HERE="$(cd "$(dirname "$0")" && pwd)"

id "$USER_NAME" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$USER_NAME"
passwd -l "$USER_NAME" >/dev/null
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"

install -o root -g root -m 0755 "$HERE/take2-release" /usr/local/bin/take2-release
install -o root -g root -m 0755 "$HERE/take2-pull" /usr/local/bin/take2-pull

SUDOERS=/etc/sudoers.d/take2-deploy
echo "$USER_NAME ALL=(root) NOPASSWD: /usr/local/bin/take2-pull" > "$SUDOERS.tmp"
visudo -cf "$SUDOERS.tmp" >/dev/null && install -m 0440 "$SUDOERS.tmp" "$SUDOERS"
rm -f "$SUDOERS.tmp"

# Kubernetes access: the take2-deployer service account (see deploy/k8s/bootstrap.yaml).
TOKEN="$(k3s kubectl -n take2 get secret take2-deployer-token -o jsonpath='{.data.token}' | base64 -d)"
CA="$(base64 -w0 /var/lib/rancher/k3s/server/tls/server-ca.crt)"
install -d -o "$USER_NAME" -g "$USER_NAME" -m 0700 "$HOME_DIR/.kube" "$HOME_DIR/.ssh"
cat > "$HOME_DIR/.kube/config" <<KUBE
apiVersion: v1
kind: Config
clusters:
  - name: local
    cluster: { server: "https://127.0.0.1:6443", certificate-authority-data: "$CA" }
users:
  - name: take2-deployer
    user: { token: "$TOKEN" }
contexts:
  - name: take2
    context: { cluster: local, user: take2-deployer, namespace: take2 }
current-context: take2
KUBE
chown "$USER_NAME:$USER_NAME" "$HOME_DIR/.kube/config"
chmod 0600 "$HOME_DIR/.kube/config"

echo "restrict,command=\"/usr/local/bin/take2-release\" $PUBKEY" > "$HOME_DIR/.ssh/authorized_keys"
chown "$USER_NAME:$USER_NAME" "$HOME_DIR/.ssh/authorized_keys"
chmod 0600 "$HOME_DIR/.ssh/authorized_keys"
echo "take2-deploy is ready."
