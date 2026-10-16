# Talking-avatar prompts (v2: left-third avatar, merged into the page)

The avatar no longer sits on a white panel. It stands directly on the site's dark terrain in the left third of the opening screen. For that, every clip is generated on a **solid chroma-key green background**, which the build pipeline removes, so only you remain, with a real transparent edge.

You'll generate **one image** and **four short clips** (8 s each, except the wave).

| Clip | Speaks? | Used for |
|---|---|---|
| A · Intro | yes | the first thing the visitor hears |
| B · Offer + point | yes | follows A; points at the résumé button on the right |
| C · Idle loop | no | plays whenever you're not talking (loops forever) |
| D · Wave | no | plays once when you first appear (optional but nice) |

Every clip **starts and ends on exactly the same pose** (your reference image), so the site can cut between them invisibly. That's what makes the avatar feel interactive: idle → wave → talk → point → idle, driven by what the visitor does.

---

## Step 0: make the green-screen reference (ChatGPT or Gemini)

Upload `Confident South Asian Man in Studio Pose.png` (the one you made) and, as the identity check, `Lakshya_photo1.jpg`. Paste:

```
Recreate the first image as a new 9:16 vertical portrait. Keep the character exactly as he is in the first image: the same 3D character style, face, expression, curly hair, white button-up shirt with rolled sleeves, black pleated trousers, white sneakers, and the same relaxed confident pose with arms crossed. Use the second image only to keep the face true to the real person. Frame him full body, head to toe, centred, filling about 88% of the frame height with a small even margin above the head and below the feet. Replace the background with a completely flat, uniform chroma-key green (hex #00B140) from edge to edge: no gradient, no vignette, no floor, no horizon, no shadow on the background. Light him with soft even studio light from the front, plus a gentle cool rim light from behind on his hair and shoulders so his outline separates cleanly. No green reflections on the skin or the white shirt. No text, logos, props or extra people. Output one high-resolution 9:16 image.
```

Save it as `assets-inbox/character-green.png`.

> **Hair check:** the reference has tight curls, while `Lakshya_photo1.jpg` shows straight hair swept to the side. If you want the avatar to look like you today, replace "curly hair" above with "his real hairstyle from the second image: straight dark hair swept to the side".

---

## Step 1: the four clips (Google Flow)

In Flow choose **Frames to Video**, **9:16**, **8 s**, model **Veo 3.1 Quality** (Fast is fine for drafts). For every clip upload `character-green.png` as **both the first frame and the last frame**. That forces the clip to end on the starting pose. Keep audio **on** for A and B (we use the generated mouth timing; the voice itself gets replaced with yours later).

### Shared block (paste at the top of every clip prompt)

```
Use the uploaded image as the exact first and last frame. Same character, same 3D style, same face, hair, clothes and proportions in every frame; do not redesign him, change his outfit, age, body shape or hairstyle. He stands centred, full body head to toe visible the whole time, never cropped, feet planted in place. Fixed camera: straight-on, eye level, no movement, no zoom, no cuts, same framing throughout. Background: the same completely flat chroma-key green (#00B140) from edge to edge for the entire clip, no shadows, no gradient, no lighting change, no objects. Soft even studio light with a gentle cool rim light, constant throughout. No text, captions, subtitles, logos or watermarks. No extra people. Clean, stable edges with no flicker, morphing, extra fingers or distorted hands. One continuous shot that begins and ends in exactly the pose of the uploaded image.
```

### Clip A · Intro (speaks)

```
[shared block]

PERFORMANCE: He looks straight into the camera and introduces himself warmly and confidently, like greeting a recruiter. He starts with his arms crossed, then uncrosses them as he begins speaking. While talking he uses natural explaining hand gestures at chest height: one open palm on "AI engineer", both hands shaping something on "I build AI agents", a small forward push of one hand on "ship them to production". Small natural head movements, a friendly smile, natural blinking. In the final second he returns smoothly to arms crossed, exactly as in the image.

EXACT SPOKEN SCRIPT: "Hey, I'm Lakshya Jain — an AI engineer and software engineer. I build AI agents and ship them to production."

VOICE: Young adult male, light Indian English accent, warm, confident, natural pace, clear diction, accurate lip sync. Speak the script exactly once, word for word, starting after a short breath. Audio: voice only, no music, no sound effects, no room echo.
```

### Clip B · Offer and point (speaks)

```
[shared block]

PERFORMANCE: Continuing the same conversation, relaxed and confident. He uncrosses his arms and gestures openly with both hands on "LLM platforms and on-device models". On "Open to internships, full-time roles and client work" he opens his palms toward the camera in an inviting way. On "my résumé's right here" he turns his torso slightly and points with his left hand toward the right edge of the frame (the viewer's right), glancing that way for a beat, then looks back at the camera with a smile. In the final second he returns smoothly to arms crossed, exactly as in the image.

EXACT SPOKEN SCRIPT: "I've shipped LLM platforms and on-device models. Open to internships, full-time roles and client work — my résumé's right here."

VOICE: Same young adult male voice as before: light Indian English accent, warm, confident, natural pace, accurate lip sync. Speak the script exactly once, word for word. Audio: voice only, no music, no sound effects.
```

### Clip C · Idle loop (silent)

```
[shared block]

PERFORMANCE: He stands relaxed with arms crossed and does not speak. Only subtle, natural life: slow breathing visible in the chest and shoulders, natural blinking, a slight head tilt and a small, friendly smile toward the camera, a tiny shift of weight between his feet, eyes glancing briefly to the viewer's right and back. Calm and loopable; the motion is small enough that the last frame matches the first exactly.

AUDIO: complete silence. No voice, no music, no sound.
```

### Clip D · Wave (silent, 4–6 s)

```
[shared block]

PERFORMANCE: He uncrosses his arms, raises his right hand to shoulder height and gives a short, friendly wave toward the camera with a warm smile and a small nod, then lowers his hand and returns smoothly to arms crossed exactly as in the image.

AUDIO: complete silence.
```

Save the downloads as `assets-inbox/clip-A-intro.mp4`, `clip-B-offer.mp4`, `clip-C-idle.mp4`, `clip-D-wave.mp4`.

**Tips**
- Generate 2–3 takes of A and B and keep the ones where the hands look clean and the words are exact.
- If a take changes his face or clothes, regenerate. Don't fix it later.
- If Flow refuses first and last frames together, use the first frame only and add: "end exactly in the starting pose".

---

## Step 2: the voice

The avatar uses the voice Flow generates with clips A and B. (A cloned-voice pipeline was tried and dropped: Flow's own voice was clearer and already matches the mouth.)

---

## Step 3 (automatic, once the files are in)

`npm run hero:build` will then:
- key out the green and despill the edges;
- export transparent video as stacked-alpha H.264 (colour on top, matte below), composited by a WebGL shader in every browser;
- keep Flow's voice and shorten the wave clip;
- time the captions;
- wire the clips into the left-third avatar.
