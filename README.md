# ScoreRevive

ScoreRevive is a GPT-6 Astra challenge build for restoring photographed or scanned Western sheet music into clean, symbolic, playable notation.

Drop one score page. Astra reconstructs the visible notation into ABC, reports uncertain readings instead of silently guessing them away, and supports a second verification pass against the original image. The browser renders the ABC as engraved notation through abcjs, can play it, and exports the reconstructed `.abc` source.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpranaysuyash%2Fopen-source&project-name=score-revive&repository-name=score-revive&env=OPENAI_API_KEY&envDescription=OpenAI+API+key+with+access+to+GPT-6+Astra.+The+key+is+used+only+by+the+server-side+Vercel+function.)

The deploy flow creates a `score-revive` project/repository and asks for `OPENAI_API_KEY` without putting the secret in the URL.

## Why Astra

OpenAI reports GPT-6 Astra at **0.84** on OpenScore String Quartets using `1 - OMR normalized edit distance`, versus **0.19** for GPT-5.6 Sol. ScoreRevive turns that benchmark-shaped capability into a product interaction rather than another chat surface.

- Astra model: https://developers.openai.com/api/docs/models/gpt-6-astra
- Model guidance: https://developers.openai.com/api/docs/guides/latest-model

## Product loop

1. Upload a PNG, JPEG, or WEBP score page.
2. The browser resizes it locally before upload.
3. `api/restore.js` sends the image to `gpt-6-astra` through the Responses API.
4. Astra returns strict structured output: metadata, ABC notation, confidence, and uncertain readings.
5. abcjs renders and plays the reconstructed notation in the browser.
6. Add a steering instruction such as `Ignore faint pencil marks. Recheck accidentals in measures 5-8.`
7. **Verify & refine** sends the original image plus current ABC candidate back to Astra using the previous response as context.
8. Export the corrected `.abc` file.

## Architecture

- Static HTML/CSS/JS frontend. No framework build step.
- One Vercel Node function: `api/restore.js`.
- OpenAI Responses API with `model: gpt-6-astra`.
- Image input with high detail.
- Strict JSON Schema Structured Outputs.
- `previous_response_id` for the verification continuation.
- abcjs 6.7.0 for engraving and browser synthesis.
- Client-side image resize to max 1800 px, JPEG quality 0.86.
- Server-side `OPENAI_API_KEY` only. The key is never exposed to browser JavaScript.

## Run

Static UI preview:

```bash
python3 -m http.server 4173
```

Live API flow:

```bash
npm i -g vercel
vercel dev
```

Set `OPENAI_API_KEY` in the Vercel environment before exercising the live Astra call.

## Demo without an API call

The **Preview the finished interface** control loads a clearly labeled fixture so the complete product surface can be shown without spending an Astra request. It is not presented as model output.

## Submission line

> Built ScoreRevive: drop a photo of sheet music and GPT-6 Astra reconstructs it into clean, editable, playable notation, flags uncertain readings, then checks its own transcription against the original before you export it.

## Scope

This is an experimental transcription surface, not an authoritative scholarly edition. Important notation should be verified against the source image.
