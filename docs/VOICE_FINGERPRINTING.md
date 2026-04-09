# Voice Fingerprinting — OpenHiNotes

## Overview

Voice fingerprinting allows OpenHiNotes to automatically identify known speakers during transcription. When a user records their voice in Settings, a 512-dimensional mathematical representation (embedding) is extracted via VoxHub and stored encrypted in the database. During transcription, speaker embeddings from the audio are compared against all known profiles using cosine distance, and matches replace generic labels like `SPEAKER_00` with the person's real name.

---

## Architecture

```
User records voice          VoxHub                          OpenHiNotes DB
     (browser)               (GPU server)                   (PostgreSQL)
         |                        |                               |
         |--- audio sample ------>|                               |
         |                        |-- pyannote/embedding          |
         |                        |   extracts 512-dim vector     |
         |<-- embedding (HTTPS) --|                               |
         |                                                        |
         |--- encrypt(embedding) ---> AES-256-GCM ciphertext ---->|
         |                                                        |
         
During transcription:

Audio file --- VoxHub transcribes + diarizes + extracts per-speaker embeddings --->
     |
     v
OpenHiNotes loads all encrypted profiles from DB
     |--- decrypt in memory
     |--- cosine distance vs each unknown speaker
     |--- threshold < 0.5 → match found → rename SPEAKER_XX to display_name
     |--- embeddings discarded from memory after matching
```

---

## Encryption at Rest

Voice embeddings are biometric data under GDPR. They are **encrypted at rest** using AES-256-GCM before being stored in the database.

### How It Works

Each voice profile row in the `voice_profiles` table contains:

| Column | Type | Description |
|--------|------|-------------|
| `encrypted_embedding` | `bytea` | AES-256-GCM ciphertext of the serialized embedding |
| `encryption_nonce` | `bytea(12)` | 12-byte random nonce (unique per row) |
| `encryption_tag` | `bytea(16)` | 16-byte GCM authentication tag |

The embedding (a list of 512 floats) is serialized as packed binary (`struct.pack("<512f", ...)`) before encryption. This is more compact than JSON (~2 KB vs ~8 KB per embedding).

**Encryption flow:**
1. Generate a random 12-byte nonce
2. Encrypt the binary embedding with AES-256-GCM using the server key and nonce
3. Store `(ciphertext, nonce, tag)` in the database

**Decryption flow:**
1. Read `(ciphertext, nonce, tag)` from the database
2. Decrypt with AES-256-GCM using the same server key
3. Unpack binary floats back to a list
4. Use in memory for cosine distance comparison
5. Discard from memory after matching is complete

### Why AES-256-GCM?

- **Authenticated encryption:** GCM provides both confidentiality and integrity. If the ciphertext is tampered with, decryption fails with an `InvalidTag` error.
- **Per-row nonce:** Each embedding gets a unique random nonce, so identical embeddings produce different ciphertexts.
- **Industry standard:** AES-256-GCM is recommended by NIST, OWASP, and GDPR technical guidance.

---

## Encryption Key Management

The encryption key is a 256-bit (32 bytes) AES key derived from the `VOICE_EMBEDDING_KEY` environment variable.

### Configuration

Set `VOICE_EMBEDDING_KEY` in your `.env` or Docker environment:

```bash
# Generate a secure key (run once, save the output):
python -c "import os; print(os.urandom(32).hex())"
# Example output: a1b2c3d4e5f6...  (64 hex characters)

# In .env:
VOICE_EMBEDDING_KEY=a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890
```

### Key Derivation Rules

The system handles the key as follows:

1. **64-character hex string** → decoded directly as 32 raw bytes (recommended for production)
2. **Any other string** → SHA-256 hashed to derive 32 bytes
3. **Empty / not set** → falls back to `SHA-256("voice-embedding-{SECRET_KEY}")` (development convenience only)

> **WARNING:** The fallback derivation (option 3) ties the embedding encryption key to `SECRET_KEY`. If `SECRET_KEY` is compromised (e.g., leaked in logs or exposed through a vulnerability), an attacker could also derive the embedding key and decrypt all stored voice profiles. **Always set a dedicated `VOICE_EMBEDDING_KEY` in production.**

### Best Practices

| Practice | Why |
|----------|-----|
| **Generate a dedicated key** | Don't reuse `SECRET_KEY`. A separate key limits blast radius if one is compromised. |
| **Use a 64-char hex string** | Avoids ambiguity — the key is used as-is without hashing. |
| **Never commit the key to git** | Keep it in `.env` (which is `.gitignore`d) or a secrets manager. |
| **Rotate periodically** | If you rotate the key, existing profiles become undecryptable. You'll need to re-encrypt them (see below). |
| **Back up the key securely** | If the key is lost, all encrypted embeddings are permanently unrecoverable. Store it in a password manager or secrets vault (e.g., HashiCorp Vault, AWS Secrets Manager). |
| **Use Docker secrets in production** | Prefer `docker secret` or environment injection from your orchestrator over plain `.env` files in production. |

### Key Rotation

The application supports zero-downtime key rotation. Each profile is decrypted with the old key and re-encrypted with the new key in a single database transaction.

**Step-by-step procedure:**

1. **Generate a new key:**
   ```bash
   python -c "import os; print(os.urandom(32).hex())"
   ```

2. **Set both environment variables** (in `.env` or your secrets manager):
   ```bash
   # The NEW key
   VOICE_EMBEDDING_KEY=<new 64-char hex string>
   # The PREVIOUS key (so the app can decrypt existing data)
   VOICE_EMBEDDING_KEY_OLD=<old 64-char hex string>
   ```

3. **Restart the application** so it picks up the new environment variables.

4. **Trigger rotation** via the admin API:
   ```bash
   curl -X POST https://your-instance/api/voice-profiles/admin/rotate-key \
     -H "Authorization: Bearer <admin-token>"
   ```
   The response reports how many profiles were rotated, how many failed, and the total:
   ```json
   {"rotated": 42, "failed": 0, "total": 42}
   ```

5. **Verify** that `failed` is `0`. If any profiles failed, investigate the logs — the old key may have been wrong for those rows.

6. **Remove the old key** from the environment:
   ```bash
   # Remove or comment out:
   # VOICE_EMBEDDING_KEY_OLD=...
   ```

7. **Restart the application** again to clear the old key from memory.

> **Important:** Between steps 3 and 6, both keys are in memory. New profiles created during this window are encrypted with the new key. The old key is only used for decryption during rotation — it is never used for new encryptions.

### What Happens If the Key Is Lost?

All encrypted embeddings become **permanently unrecoverable**. The voice_profiles table still exists but the data is useless without the key. An admin should purge all embeddings via `DELETE /api/voice-profiles/admin/all`. User accounts are not affected — each user will see a notice in Settings that their voice data was removed, and can re-record at their convenience.

---

## GDPR Compliance

### Consent

Voice embeddings are biometric data, which is a "special category" under GDPR Article 9. The application implements explicit consent:

1. **Consent gate in Settings UI:** Before recording, users see a GDPR notice explaining what data is collected, how it is used, and that they can delete it at any time. They must click "I understand, enable voice fingerprinting" to proceed.
2. **No implicit enrollment:** Users are never enrolled without their explicit action (recording or uploading a voice sample).
3. **Feature requires admin activation:** An administrator must explicitly enable the `voice_fingerprinting_enabled` setting before any user can access the feature.

### Right to Erasure

Embeddings can be deleted without affecting the user account in any way. When embeddings are deleted externally (by an admin or system maintenance), the user sees a notice next time they visit Settings explaining that their voice data was removed and they can re-record.

**User self-service:**
- **Delete one of their own embeddings:** `DELETE /api/voice-profiles/{id}` — only works on the user's own profiles
- **Delete all of their own embeddings:** `DELETE /api/voice-profiles` (also available as "Delete all my voice data" button in Settings) — only affects the current user's embeddings

**Admin operations:**
- **Delete all embeddings for a specific user:** `DELETE /api/voice-profiles/admin/user/{user_id}` — removes all voice data for that user; the user account is untouched
- **Delete a specific embedding by ID:** `DELETE /api/voice-profiles/admin/profile/{profile_id}` — removes one embedding regardless of owner
- **Purge ALL embeddings system-wide:** `DELETE /api/voice-profiles/admin/all` — nuclear option for key rotation or security incidents; all users will need to re-record

**Automatic deletion:**
- When an admin deactivates or rejects a user, all their voice embeddings are automatically deleted
- The `voice_profiles.user_id` foreign key has `ON DELETE CASCADE`, so if a user record is removed from the database, their embeddings are deleted at the database level
- The user account itself is never deleted as part of embedding cleanup

### Data Minimization

- Only the embedding vector is stored — the original audio recording is **never kept**. It is deleted immediately after embedding extraction.
- Embeddings are not stored in logs, caches, or temporary files.
- During transcription, per-speaker embeddings from VoxHub are used for matching but are **never persisted** — they exist only in memory during the request.

### Access Control

- Users can only view and manage their own voice profiles.
- Admins can view profile metadata (label, creation date) but never the raw embedding.
- The raw embedding is never exposed in any API response.

---

## Admin Configuration

### Enabling / Disabling the Feature

The feature is controlled by the `voice_fingerprinting_enabled` app setting:

- **Admin Panel → API Settings → Voice Fingerprinting** toggle
- Default: **disabled** (opt-in)
- When disabled:
  - The voice profile UI is hidden from all users
  - `POST /api/voice-profiles` returns 403
  - Speaker matching during transcription is skipped entirely
- When disabled, existing profiles are **not deleted** — they are simply not used. Re-enabling the feature restores them.

### Matching Threshold

The cosine distance threshold for speaker matching is configurable via `SPEAKER_MATCH_THRESHOLD` (default: `0.5`):

- `0.0` = identical (perfect match)
- `0.5` = default threshold (good balance between precision and recall)
- `1.0` = orthogonal (no similarity)
- Lower values = stricter matching (fewer false positives, more missed identifications)
- Higher values = looser matching (more identifications, risk of false positives)

---

## API Endpoints

### User endpoints (operate on own data only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/voice-profiles` | Upload voice sample, create encrypted embedding |
| `GET` | `/api/voice-profiles` | List own embeddings (metadata only, never raw vectors) |
| `DELETE` | `/api/voice-profiles/{id}` | Delete one of own embeddings |
| `DELETE` | `/api/voice-profiles` | Delete all own embeddings (GDPR self-erasure) |
| `GET` | `/api/settings/features` | Check if voice fingerprinting is enabled |

### Admin endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/voice-profiles/admin/user/{user_id}` | List a user's embeddings (metadata only) |
| `DELETE` | `/api/voice-profiles/admin/user/{user_id}` | Delete all embeddings for a specific user |
| `DELETE` | `/api/voice-profiles/admin/profile/{profile_id}` | Delete a single embedding by ID |
| `DELETE` | `/api/voice-profiles/admin/all` | Purge ALL embeddings system-wide |
| `POST` | `/api/voice-profiles/admin/rotate-key` | Re-encrypt all embeddings with the new key |

> **Note:** No endpoint ever returns the raw embedding vector. The encrypted data stays in the database and is only decrypted in server memory during speaker matching.

---

## Dependencies

### OpenHiNotes Backend

Added to `requirements.txt`:

- `cryptography>=42.0.0` — AES-256-GCM encryption/decryption
- `numpy>=1.24.0` — cosine distance computation

### VoxHub

- `pyannote-audio>=3.1.0` — speaker embedding extraction model
- **HuggingFace account required** — the `pyannote/embedding` model is gated and requires accepting the Conditions of Use (CGU) at https://huggingface.co/pyannote/embedding before the model can be downloaded
- `HF_TOKEN` environment variable must be set with a valid HuggingFace access token

---

## Production Deployment Checklist

Before deploying voice fingerprinting to production:

- [ ] **`VOICE_EMBEDDING_KEY`** is set to a dedicated 64-char hex string (not relying on `SECRET_KEY` fallback)
- [ ] **The key is stored securely** in a secrets manager or Docker secret (not in a committed `.env` file)
- [ ] **The key is backed up** in a secure location — loss means all encrypted profiles are unrecoverable
- [ ] **VoxHub is served over HTTPS** (or behind an HTTPS-terminating reverse proxy like Caddy)
- [ ] **`ALLOW_INSECURE_EMBEDDINGS`** is NOT set on VoxHub (or is explicitly `false`)
- [ ] **HuggingFace CGU accepted** for `pyannote/embedding` at https://huggingface.co/pyannote/embedding
- [ ] **`HF_TOKEN`** is set on VoxHub with a valid HuggingFace access token
- [ ] **`voice_fingerprinting_enabled`** is toggled on in Admin → API Settings (feature is disabled by default)
- [ ] **OpenHiNotes frontend is served over HTTPS** (required for browser microphone access)
- [ ] **Database backups include a plan for the encryption key** — a DB backup is useless for voice profiles without the corresponding key
- [ ] **Logging does not capture embedding vectors** — verify that neither OpenHiNotes nor VoxHub log the raw float arrays

---

## Troubleshooting

### "Voice fingerprinting is disabled by the administrator"
The admin hasn't enabled the feature. Go to Admin Panel → API Settings → Voice Fingerprinting and toggle it on.

### "VoxHub embedding extraction failed: 403"
VoxHub is running over HTTP and refuses to return embeddings. Either configure HTTPS or set `ALLOW_INSECURE_EMBEDDINGS=true` on VoxHub (development only).

### "Failed to decrypt voice profile: InvalidTag"
The `VOICE_EMBEDDING_KEY` has changed since this embedding was created. The original key is needed to decrypt. If the key is lost, an admin should purge the affected embeddings (`DELETE /api/voice-profiles/admin/all` for system-wide, or per-user). The user accounts are not affected — users will see a notice that their voice data was removed and can re-record.

### Embeddings from VoxHub are missing
VoxHub may not support the `return_speaker_embeddings` parameter yet. Check that VoxHub has been updated with the speaker embedding spec. If VoxHub doesn't return `speaker_embeddings` in the response, speaker matching is silently skipped (non-fatal).

### "Could not access microphone"
The browser needs permission to use the microphone. Check browser settings and ensure the page is served over HTTPS (browsers block mic access on HTTP pages).
