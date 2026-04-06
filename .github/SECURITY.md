# Security Policy

## Scope

This project runs locally on your machine and processes your Pi coding session data. Security concerns relevant to this project include:

- Vulnerabilities that could cause the extension to leak session observations or instinct data
- Issues with the secret scrubber (which strips API keys, tokens, and passwords from observations before writing to disk)
- Arbitrary code execution via maliciously crafted observation data or instinct files

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub issues.**

Report vulnerabilities privately by emailing the maintainer or using [GitHub's private vulnerability reporting](https://github.com/MattDevy/pi-continuous-learning/security/advisories/new).

Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- The version(s) affected

You can expect an acknowledgement within 5 business days. If the issue is confirmed, a fix will be prioritised and a patched release will be published as soon as practicable.
