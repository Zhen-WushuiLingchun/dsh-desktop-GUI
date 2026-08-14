# GitHub update check design

DSH Desktop checks for a newer application version only after the local DSH WebUI has loaded successfully. The check sends one unauthenticated `GET` request per application process to GitHub's latest-release endpoint for `Zhen-WushuiLingchun/dsh-desktop-GUI`, with a five-second timeout.

Only a non-draft, non-prerelease tag matching semantic version syntax is considered. If the remote version is newer than `app.getVersion()`, Electron displays a native confirmation dialog. Confirming opens the repository's fixed latest-release page in the system browser. The application never downloads, executes, or installs an update itself.

Network errors, rate limiting, malformed responses, and repositories without releases are silent and do not affect startup. Version parsing, comparison, release filtering, and the canonical release link are covered by offline Node tests. Runtime smoke testing confirms the check does not create a console window, start another Node process, or change DSH backend ownership.
