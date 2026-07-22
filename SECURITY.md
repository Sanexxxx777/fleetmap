# Security Policy

fleetmap is a local, offline diagram renderer — it reads a `pm2 jlist` snapshot or a
hand-written JSON file and produces a self-contained HTML file. It does not make
network calls, store credentials, or execute remote code.

## Reporting a vulnerability

If you find a security issue (e.g. unsafe HTML generation, script injection via
crafted fleet JSON), please open a private security advisory on GitHub
(**Security → Report a vulnerability**) or open an issue at
[github.com/Sanexxxx777/fleetmap/issues](https://github.com/Sanexxxx777/fleetmap/issues)
rather than disclosing details publicly first.
