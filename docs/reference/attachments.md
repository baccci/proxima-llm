# Attachments (`features/attachment/attachment.repository.ts`)

How a file the user attaches to a chat (an image or a PDF) is validated, stored, and later
handed to the model or the renderer. The whole feature is a single file, and it is the reference
example for the repository convention "one cohesive module owns the aggregate, do not split it"
(see [conventions/architecture.md](../conventions/architecture.md)).

## What an attachment is, in plain language

When the user drops an image or a PDF onto a chat, the app stores two things: the raw bytes as a
file on disk, and a metadata row in the `attachments` table (id, chatId, kind, media type, size,
sha256, relative path). Everything else (showing a thumbnail, sending the file to the model,
downloading it) reads from those two.

Storage is content-addressed: the file lives at `userData/attachments/<chatId>/<sha256>.<ext>`,
and the row is keyed by `(chatId, sha256)`. So re-uploading identical bytes into the same chat
reuses the existing row and file instead of writing a duplicate.

## Why it is one file

The whole feature is a single module, and that is deliberate. A repository is earned by scattered
data access, not required for every aggregate. Attachments own 100% of their table and blob
access here, and nothing else in the app touches the `attachments` table directly. Splitting this
into service plus repository would only manufacture passthrough reads. It reads clean as one
cohesive unit, so it stays whole.

It does hold two concerns at once, DB rows and filesystem blobs, but they are the same aggregate
(an attachment is its row plus its bytes), so keeping them together is correct, not a violation.

## The save flow (`saveAttachment`)

One RPC call (`uploadAttachment`) lands here with `{ chatId, name, data (base64), mediaType }`:

1. **Validate the media type** against `ALLOWED_TYPES` (png/jpeg/webp/gif/pdf), and throw on
   anything else. This is the security gate: it stops arbitrary file types being written to disk.
2. **Decode and size-check.** Base64 to bytes; throw if over `MAX_BYTE_SIZE` (20 MB), the
   denial-of-service guard.
3. **Hash and classify.** `sha256` of the bytes; `kind` is `image` when the media type starts with
   `image/`, otherwise `file`.
4. **Content-address.** Look up `(sha256, chatId)`; if a row exists, return it, with no re-write.
5. **Write once.** If the target file is not already on disk, `mkdir -p` the chat dir and write the
   bytes.
6. **Insert and parse.** Insert the metadata row, read it back with `returning()`, and return it
   through `rowToDTO`.

`resolveExtension` picks the on-disk extension: prefer the uploaded name's extension, else map from
the media type (`MEDIA_TYPE_EXTENSIONS`), else `bin`.

## The read paths

Four readers, each shaped for its consumer:

| Function | Returns | For |
|---|---|---|
| `getAttachment(id)` | `AttachmentDTO` (metadata only) | callers that need the row, e.g. building a message part |
| `getAttachmentBytes(id)` | `{ bytes, mediaType, kind }` | the model, raw bytes to base64 into the prompt |
| `getAttachmentView(id)` | `AttachmentView` (metadata plus a `data:` URL) | the renderer, for inline preview and download |
| `listAttachments(chatId)` | `AttachmentDTO[]` | a chat's attachment list |

Every row read goes through `rowToDTO` and `AttachmentDTO.parse`, so a malformed `kind` or a
missing field fails here at the DB boundary, not in the renderer.

## Consumers

- **RPC** (`entry/rpc.ts`): `uploadAttachment` calls `saveAttachment`; `getAttachment` calls
  `getAttachmentView` (the renderer wants the data URL).
- **`chat.repository`**: `getAttachment(id)` when assembling a message's attachment parts.
- **Streaming** (`chat-stream.service` and `build-prompt`): `resolveAttachment(id)` calls
  `getAttachmentBytes` and base64-encodes them into the provider `image` / `file` parts. A missing
  attachment resolves to a placeholder rather than crashing the turn (see
  [stream-engine.md](stream-engine.md)).

## Things worth knowing

**The original filename is not persisted.** There is no `name` column. The uploaded name is used
only to pick the file extension in `resolveExtension`; the file on disk is `<sha256>.<ext>`.
`getAttachmentView` reconstructs the name from `relPath` (`.split('/').pop()`), so a downloaded
attachment is named `<sha256>.<ext>`, not the user's original filename. Restoring it needs a `name`
column, which is a migration.

**The upload input is validated at the RPC boundary.** `uploadAttachment` parses the raw renderer
payload with `SaveAttachmentInput.parse` before it reaches `saveAttachment`. `chatId` is
constrained to a uuid because it flows straight into the storage path
(`join(userData, 'attachments', chatId)` and `relPath`); without that constraint a value
containing path separators could escape the attachments directory. The media-type allowlist and
size cap stay in `saveAttachment` so their specific errors survive a valid-shape payload.

**Content-addressing means storage is shared per chat.** Two chats attaching the same bytes get
separate rows (keyed by chatId), so identical bytes across chats do write twice. That is
intentional: a chat's attachments are self-contained.

## Named constants

- `MAX_MB = 20` / `MAX_BYTE_SIZE` — the upload size cap (the denial-of-service guard).
- `ALLOWED_TYPES` — the media-type allowlist (the write security gate).
- `MEDIA_TYPE_EXTENSIONS` — media type to on-disk extension fallback.

## Tests

None yet, and the pure logic here is thin: `resolveExtension` (name and media type to extension)
and the `image/` to `kind` classification are the only unit-testable bits, and both are trivial.
The meaningful behaviors (the allowlist rejection, the size cap, content-addressed dedup) are all
bound to the DB and filesystem, so they are integration surface, not pure units.

## Links

- [stream-engine.md](stream-engine.md) — `resolveAttachment` / `toCoreMessages` turning bytes into
  provider image/file parts, and the missing-attachment placeholder.
- [../architecture.md](../architecture.md) — process model, IPC, DB.
