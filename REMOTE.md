# Optional private phone access

First verify local access works. The host computer must stay awake, online, and running the board. Your phone controls the host's project directories, not files on the phone.

Use a private network such as Tailscale. Install it on both devices, authenticate yourself, and restrict network access to trusted devices. Follow the current [Tailscale Serve guide](https://tailscale.com/kb/1242/tailscale-serve). Serve should forward your private HTTPS origin to `http://127.0.0.1:8765`; do not enable Funnel or expose the port to the internet.

Start the board with its exact HTTPS origin, replacing the example with your own device domain:

```sh
BOARD_REMOTE_ORIGIN=https://your-device.example.ts.net python3 -B server.py
```

If changing the port, update both `BOARD_PORT` and Serve's target. The origin is a configuration value, not a password. The board still has no login; every device authorized to reach it can operate it. HTTPS device names may appear in public certificate transparency logs. Read the provider's notice before enabling HTTPS.

No private network state, device certificates, startup agents or credentials are supplied in this repository. Setting up background services is a separate optional task requiring the owner's authorization.
