# ProtonVPN SOCKS5 Proxy

OpenVPN → SOCKS5 proxy in Docker. Base image: `curve25519xsalsa20poly1305/openvpn-socks5:latest`

## Env vars

- `OVPN_CONFIG_BASE64` — base64-encoded .ovpn file
- `OPENVPN_USER` — ProtonVPN OpenVPN username
- `OPENVPN_PASS` — ProtonVPN OpenVPN password

## Compose

```yaml
openvpn-socks5:
  build: ./openvpn-socks5
  cap_add: [NET_ADMIN]
  devices: [/dev/net/tun]
  environment:
    OVPN_CONFIG_BASE64: ${OVPN_CONFIG_BASE64}
    OPENVPN_USER: ${OPENVPN_USER}
    OPENVPN_PASS: ${OPENVPN_PASS}
```

Proxy at `socks5://openvpn-socks5:1080`

## Base64 encode a config

```bash
base64 -w0 us-fl-100.protonvpn.tcp.ovpn
```

## Username suffixes

Append to OpenVPN username for extras:
- `+f1` anti-malware
- `+f2` ad-blocking
- `+nr` moderate NAT
- combinable: `username+f2+nr`

## Available configs

```
us-fl-100.protonvpn.tcp.ovpn
us-az-83.protonvpn.tcp.ovpn
us-az-83.protonvpn.udp.ovpn
us-co-245.protonvpn.tcp.ovpn
us-ca-76.protonvpn.tcp.ovpn
```
