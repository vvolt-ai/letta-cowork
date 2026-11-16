# File Manager deliverable tools

Source/date:2026-11-16, Bhavesh requested agent-uploaded deliverables and download links. The current File Manager Service1.0.0 OpenAPI/health were rechecked. Its fixed origin is `https://filemanage.ngrok.app`; authentication, expiry, ACL/deletion and retention guarantees are not declared. Treat links as access-bearing, not private.

Desktop SDK sessions offer the registered tools below. FileManagerHealth is allowed in read-only plan mode; FileManagerUpload is not. Session grants/Full Access never replace its fresh publication confirmation.

Desktop SDK sessions offer:

- `FileManagerHealth({})`: bounded read-only service check.
- `FileManagerUpload({file_path,confirm_public_upload:true})`: one explicitly authorized final file within the current host workspace, at most25MiB. A fresh human permission response is required even in Full Access or after a prior tool grant. The confirmation argument is not permission to disclose unrelated/private data.

The tool snapshots a regular stable file, rejects outside/private/hidden/secret-like paths and obvious key content, sends one multipart POST without credentials/redirects/retries, then checks a returned same-service link against the original byte count/SHA-256. Only `download_verified:true` yields a completed `download_url`. Return a Markdown download link, not a local path or file bytes. A `receipt_download_url`/uncertain response is not verified; the file may already be stored, so never auto-reupload. This is not DLP, format/content inspection or a guarantee that a recipient downloaded the file.

```json
{"file_path":"reports/final-report.pdf","confirm_public_upload":true}
```

Generate/review the final artifact on the selected execution host; never substitute a path on a different computer, read protected sandbox storage or copy denied files as a workaround. Vera SDK additionally offers `FileManagerUploadArtifact` for a known owner-authorized artifactId through its existing protected native reader; that tool does not accept a local/private path or remote-owner route. It is not a new standalone `vera_native__` MCP tool. See the paired server source guide `services/vera-cowork-server/docs/file-manager-tools.md` in ai-platform for the artifact/authorization contract.

Implementation: `src/electron/services/client-tools/runners/fileManager.ts`, existing registry and permission handler; tests in `test/file-manager.test.mjs`. The core is mirrored by the server runner, so preserve semantics on both sides. The canonical `VerivoltDev/Skills/file-manager`1.1.0 source documents tool-versus-helper routing; source publication does not install that skill.

Validation uses synthetic temp files and mocked HTTPS responses, not live uploads or user files. New tools require a rebuilt/reloaded app/runtime; builds and schema registration do not establish live service upload acceptance. No external email/channel message, file listing/deletion or automatic artifact publication is added. Old attachment-ingestion upload helpers are unchanged.
