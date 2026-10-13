# Data and backups

## Where everything is

There's no database. Everything for a site is in one folder, `server/data/`
unless `DATA_DIR` says otherwise:

| File | What's in it |
| --- | --- |
| `page.json` | The published page: profile, design, settings and cards |
| `draft.json` | Unpublished changes, while there are any |
| `versions/` | Version history |
| `uploads/` | Uploaded photos and PDFs |
| `analytics.json` | Statistics (daily totals only, no IP addresses) |
| `inbox.json` | Contact form messages |
| `shortlinks.json` | Short links and their visit counts |
| `signins.json` | The last 30 sign-in attempts |
| `auth.json` | The password, as a scrypt hash |
| `twofactor.json` | The two-step sign-in secret, if it's on |
| `secret.key`, `sessions.json`, `admin-path` | The cookie key, who's signed in, and the editor address |
| `integrations.json` | Instagram and newsletter tokens, if connected |
| `backups/` | The automatic backups |

The files with secrets in them are only readable by the app's own user, and
the whole folder is in `.gitignore`. Inbox messages and sign-in attempts are
personal data, so treat backups with the same care.

## Backups

Every night at 03:30, server time, the app packs the whole data folder into a
`.tar.gz` in `server/data/backups/` and keeps the newest 14. If the server was
off at that time, it catches up a minute after it starts again. **Settings >
Backup** in the editor shows when the last one ran.

```bash
sudo -u www-data npm run backup             # back up now
sudo -u www-data npm run backup -- --list   # see what's there
```

`BACKUP_TIME`, `BACKUP_KEEP` and `BACKUP_DIR` in `.env` change when, how many
and where. `BACKUP=off` stops the nightly run.

### Off-site copies

A backup on the same disk won't help if the disk dies, so it's worth sending a
copy somewhere else. The simplest option is a second folder, such as a NAS
share mounted on the server:

```ini
BACKUP_COPY_DIR=/mnt/nas/trellis-backups
```

Under systemd the app isn't allowed to write there until you add the folder
to `ReadWritePaths` (`sudo systemctl edit trellis`), for example
`ReadWritePaths=/opt/trellis/server/data /mnt/nas/trellis-backups`.

You can also upload to S3-compatible storage (AWS S3, Cloudflare R2,
Backblaze B2, Wasabi, MinIO):

```ini
BACKUP_S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
BACKUP_S3_REGION=eu-central-1     # "auto" for R2
BACKUP_S3_BUCKET=my-backups
BACKUP_S3_PREFIX=trellis
BACKUP_S3_ACCESS_KEY=...
BACKUP_S3_SECRET_KEY=...
```

Give that key permission to upload and nothing else (`s3:PutObject`), so
someone who steals it can't read or delete your backups. Trellis doesn't
delete old backups from the bucket, so add a lifecycle rule there (delete
after 30 days, say). If an upload fails, the local backup is still made and
the error shows up in the editor.

## Restoring

```bash
sudo systemctl stop trellis
sudo -u www-data npm run restore -- latest    # or a file name from --list
sudo systemctl start trellis
```

It shows you what's in the backup and asks before changing anything. The
current data is backed up first, so you can undo a restore the same way.
Everyone has to sign in again afterwards.

The backups are ordinary tar files, so you can also open them by hand
(`tar -tzf trellis-....tar.gz`). To bring back only the page, use **Import
JSON** in the editor with a file from **Export JSON**.

## Moving a site

Install Trellis on the new server, copy the data folder over and start it.
The password, editor address, design and content all come with it.

## Resetting things

- New password: `npm run set-password` (this also signs everyone out).
- Sign out every device: More > Sign-in & security in the editor, or
  `npm run sign-out-all` on the server.
- Turn off two-step sign-in: `npm run reset-2fa`.
- A new editor address: `npm run admin-url -- --rotate`.
- Start the page from scratch: stop the server, delete `page.json` and start
  it again.
