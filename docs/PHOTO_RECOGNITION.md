# Photo recognition and review

## What changed

The original implementation sent every photo directly to a printed-text Tesseract pass. It did not provide a useful handwriting fallback, crop/rotation tools, or coordinate-by-coordinate review. The parser also rejected Easting/Northing pairs separated by a slash.

The updated flow:
1. Open Scan screenshot / 识别照片 / 截图 and choose an image.
2. Crop to the coordinate list, rotate if needed, and adjust contrast.
3. Choose local printed-text recognition, optional server handwriting recognition, or manual side-by-side entry.
4. Edit the candidate rows against the visible photo. Raw OCR text remains available. Unreadable digits stay as ?; short numbers are not padded and letters are not silently changed into digits.
5. Continue to the coordinate review screen. Confirm every digit and the chosen coordinate system/datum before creating geometry.
6. Export normally. A slash-separated pasted list also works.

Both recognition paths produce suggestions. No confidence score is treated as a guarantee. The presence of six-digit coordinates does not establish UTM zone 29N or WGS84.

## Local recognition

Tesseract runs in the browser. The app crops, rotates and rescales the image and optionally normalizes grayscale contrast. A second page-layout pass is attempted when the first cannot find sufficient rows. This improves usable text input but does not turn Tesseract into a reliable handwriting recognizer.

JPEG/PNG/WebP are recommended. Image uploads are limited to 10 MB and decoded images to 40 megapixels in the client. Engine/language downloads require network access when not cached.

## Optional handwriting service

Create a local .env (ignored by Git and Docker), using .env.example:
```
OPENAI_API_KEY=your-key
OPENAI_VISION_MODEL=gpt-4.1-mini
```
Restart npm run dev or npm start after changing it. Never use VITE_OPENAI_API_KEY or put credentials in the browser. The current development environment has no key configured, so this button is correctly disabled and the UI explains the fallback.

GET /api/ocr/capabilities exposes only availability, not the key.
POST /api/ocr/handwriting accepts raw JPEG/PNG/WebP bytes, validates file signatures, enforces 10 MB, limits requests to five per IP per minute and two concurrent upstream calls, and times out.

The user explicitly selects the server reader. The cropped image is sent via our backend to the OpenAI Responses API as high-detail image input. It uses a strict structured-output schema, store:false, no tools, and instructions to preserve uncertainty and never infer digits or CRS metadata. The app does not persist photos or log photo contents. Provider-side handling still follows the provider's data policies; store:false is not a claim of zero retention by the provider.

The endpoint has in-memory limits appropriate to this single-process deployment. Account access/billing for the configured API model is required. The implementation uses the official [image input guide](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs), and [GPT-4.1 mini reference](https://developers.openai.com/api/docs/models/gpt-4.1-mini), checked 2026-09-08.

## Validation and remaining limitations

- Tests cover slash rows, decimal rows, preservation of ? and short values, absent CRS, request schema, upstream errors, and Chinese translations.
- Typed-screenshot recognition is exercised with real Tesseract in Chrome.
- The complete Chinese/manual-photo workflow is exercised in a mobile viewport.
- The server request is tested with mocked responses. A live handwriting-model call was NOT tested because no API key is configured.
- The particular handwritten photo attached in the conversation was visually reviewed but its image bytes are not available as a local test fixture. The local drafts/ folder contains a clearly marked manual transcription with uncertain values and is excluded from Git/Docker.
- Handwriting accuracy is not guaranteed even with the optional service. Point 7's Easting and some other handwritten digits remain unresolved, as does the photograph's CRS.
