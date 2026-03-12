FROM curve25519xsalsa20poly1305/openvpn-socks5:latest

# Custom entrypoint that reads config from env var
COPY entrypoint.sh /entrypoint-custom.sh
RUN chmod +x /entrypoint-custom.sh

ENTRYPOINT ["/entrypoint-custom.sh"]
