#!/bin/bash
set -e

mkdir -p /vpn

# Decode base64 config from env var
if [[ -n "$OVPN_CONFIG_BASE64" ]]; then
    echo "$OVPN_CONFIG_BASE64" | base64 -d > /vpn/config.ovpn
    echo "[openvpn] Config written from OVPN_CONFIG_BASE64"
fi

# Generate auth file from env vars
if [[ -n "$OPENVPN_USER" && -n "$OPENVPN_PASS" ]]; then
    echo "$OPENVPN_USER" > /vpn/auth.txt
    echo "$OPENVPN_PASS" >> /vpn/auth.txt
    chmod 600 /vpn/auth.txt
    sed -i 's|^auth-user-pass$|auth-user-pass /vpn/auth.txt|' /vpn/config.ovpn
    echo "[openvpn] Auth file created"
fi

# Remove problematic resolvconf scripts
sed -i '/up \/etc\/openvpn\/update-resolv-conf/d' /vpn/config.ovpn
sed -i '/down \/etc\/openvpn\/update-resolv-conf/d' /vpn/config.ovpn
sed -i '/script-security 2/d' /vpn/config.ovpn

export OPENVPN_CONFIG=/vpn/config.ovpn
echo "[openvpn] Starting OpenVPN..."
exec /usr/local/bin/entrypoint.sh "$@"
