"""Build the talking-avatar assets for the opening stage (pipeline v2).

The avatar stands directly on the page, so every Flow clip is generated on chroma-key green
(see avatar/PROMPTS.md). This script keys the green out and packs each clip as a
"stacked-alpha" H.264 MP4 (colour on top, alpha matte below) that a tiny WebGL shader
composites in every browser, Safari included.

Inputs (assets-inbox/ by default):
  clip-A-intro.mp4   speaks script line 1          (required for real mode)
  clip-B-offer.mp4   speaks script line 2          (optional)
  clip-C-idle.mp4    silent loop                   (optional, recommended)
  clip-D-wave.mp4    silent wave                   (optional; shortened, see WAVE_START/WAVE_SPEED)
  avatar/script.txt  line 1 = intro, line 2 = offer (caption text)

The speaking clips keep the voice Flow generated with them; captions are timed to its pauses.

Output (public/hero/ by default):
  intro.mp4 offer.mp4 idle.mp4 wave.mp4   stacked-alpha clips (only those provided)
  poster.png                              first frame with alpha
  portrait-bust.webp                      head-to-chest crop with alpha (used by the field pass)
  manifest.json                           version 2 (read by src/components/intro/manifest.ts)

Usage: python scripts/build-hero-assets.py [--inbox DIR] [--out DIR]
Needs: ffmpeg + ffprobe on PATH (with chromakey/despill/alphaextract), numpy, Pillow.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_FILE = ROOT / "avatar" / "script.txt"

OUT_W, OUT_H = 576, 1024  # 9:16 per visible frame; the encoded frame is OUT_W × 2·OUT_H
FPS = 24
CLIPS = {  # site name → inbox stem, does it speak, loops
    "wave": ("clip-D-wave", False, False),
    "intro": ("clip-A-intro", True, False),
    "offer": ("clip-B-offer", True, False),
    "idle": ("clip-C-idle", False, True),
}
SEQUENCE = ["wave", "intro", "offer"]
KEY_SIMILARITY = 0.14  # chromakey tolerance around the sampled backdrop colour
KEY_BLEND = 0.07
SUBJECT_DISTANCE = 90  # RGB distance from the key above which a pixel is "subject" (for framing)
AUDIO_RATE = 16_000
# The full 6 s wave felt long before he speaks. Skip its static opening and play the rest faster:
# the whole gesture survives (uncross → wave → arms crossed again), it just takes about half as long,
# and it still ends in the pose the intro starts in, so the cross-fade never jumps.
WAVE_START, WAVE_SPEED = 1.0, 1.5
# Regions painted with the key colour before keying and ignored when framing, as fractions of the
# source frame (x0, y0, x1, y1). Flow/Gemini stamp a small "✦" mark in the bottom-right corner.
GARBAGE = [(0.84, 0.86, 1.0, 1.0)]


# ───────────────────────── helpers ─────────────────────────

def run(cmd: list[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=capture)


def need(tool: str) -> None:
    if shutil.which(tool) is None:
        sys.exit(f"error: {tool} not found on PATH")


def find_clip(inbox: Path, stem: str) -> Path | None:
    for ext in ("mp4", "mov", "webm", "mkv"):
        p = inbox / f"{stem}.{ext}"
        if p.exists():
            return p
    return None


def probe(path: Path) -> dict:
    info = json.loads(
        run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)], capture=True).stdout
    )
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    audio = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    num, den = (int(x) for x in video.get("r_frame_rate", "24/1").split("/"))
    return {
        "w": int(video["width"]),
        "h": int(video["height"]),
        "fps": num / den if den else 24.0,
        "duration": float(info["format"]["duration"]),
        "has_audio": audio is not None,
    }


def grab_frame(path: Path, t: float, w: int, h: int) -> np.ndarray:
    raw = run(
        ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(path), "-frames:v", "1",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.uint8)[: w * h * 3].reshape(h, w, 3)


def even(n: float) -> int:
    n = int(round(n))
    return n - (n % 2)


# ───────────────────────── framing ─────────────────────────

def key_colour(path: Path, meta: dict) -> np.ndarray:
    """The backdrop colour Flow actually rendered: median of a thin border on the first frame."""
    f = grab_frame(path, 0.05, meta["w"], meta["h"]).astype(np.int32)
    b = max(4, min(meta["w"], meta["h"]) // 50)
    border = np.concatenate([f[:b].reshape(-1, 3), f[-b:].reshape(-1, 3), f[:, :b].reshape(-1, 3), f[:, -b:].reshape(-1, 3)])
    return np.median(border, axis=0)


def subject_box(path: Path, meta: dict, key: np.ndarray) -> tuple[int, int, int, int] | None:
    w, h, dur = meta["w"], meta["h"], meta["duration"]
    x0, y0, x1, y1 = w, h, -1, -1
    for i in range(10):
        f = grab_frame(path, min(dur - 0.05, (i + 0.5) * dur / 10), w, h).astype(np.int32)
        mask = np.sqrt(((f - key) ** 2).sum(axis=2)) > SUBJECT_DISTANCE
        for gx0, gy0, gx1, gy1 in GARBAGE:
            mask[int(gy0 * h) : int(gy1 * h), int(gx0 * w) : int(gx1 * w)] = False
        rows = np.where(mask.sum(axis=1) > max(2, w // 300))[0]
        cols = np.where(mask.sum(axis=0) > max(2, h // 300))[0]
        if rows.size == 0 or cols.size == 0:
            continue
        x0, x1 = min(x0, int(cols[0])), max(x1, int(cols[-1]))
        y0, y1 = min(y0, int(rows[0])), max(y1, int(rows[-1]))
    return None if x1 < 0 else (x0, y0, x1, y1)


def crop_window(box: tuple[int, int, int, int], fw: int, fh: int) -> tuple[int, int, int, int]:
    """One 9:16 window, shared by every clip, that holds the subject head to toe with headroom."""
    x0, y0, x1, y1 = box
    bh = y1 - y0
    ch = min(fh, bh * 1.1)
    cw = ch * OUT_W / OUT_H
    if cw > fw:
        cw = fw
        ch = cw * OUT_H / OUT_W
    cx = (x0 + x1) / 2
    top = min(max(0.0, y0 - bh * 0.06), fh - ch)
    left = min(max(0.0, cx - cw / 2), fw - cw)
    return even(cw), even(ch), even(left), even(top)


# ───────────────────────── audio ─────────────────────────

def load_audio(path: Path) -> np.ndarray:
    raw = run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(AUDIO_RATE), "-f", "s16le", "-"], capture=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def voiced_frames(audio: np.ndarray, hop_s: float = 0.02) -> tuple[np.ndarray, float]:
    hop = int(AUDIO_RATE * hop_s)
    n = len(audio) // hop
    if n == 0:
        return np.zeros(0, bool), hop_s
    rms = np.sqrt((audio[: n * hop].reshape(n, hop) ** 2).mean(axis=1))
    floor, peak = np.percentile(rms, 10), np.percentile(rms, 95)
    return rms > floor + (peak - floor) * 0.12, hop_s


def speech_window(audio: np.ndarray) -> tuple[float, float]:
    v, hop = voiced_frames(audio)
    idx = np.where(v)[0]
    if idx.size == 0:
        return 0.0, len(audio) / AUDIO_RATE
    return idx[0] * hop, (idx[-1] + 1) * hop


def pauses(audio: np.ndarray, min_gap: float = 0.12) -> list[tuple[float, float]]:
    """Silent gaps inside the speech window, longest first: (start, end) seconds."""
    v, hop = voiced_frames(audio)
    idx = np.where(v)[0]
    if idx.size < 2:
        return []
    gaps = []
    run_start = None
    for i in range(idx[0], idx[-1] + 1):
        if not v[i]:
            run_start = i if run_start is None else run_start
        elif run_start is not None:
            if (i - run_start) * hop >= min_gap:
                gaps.append((run_start * hop, i * hop))
            run_start = None
    return sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)


def chunks(audio: np.ndarray, k: int, breaks: list[tuple[float, float]] | None = None) -> list[tuple[float, float]]:
    """Speech window split at its k longest breaks → k+1 (start, end) chunks in time order."""
    s, e = speech_window(audio)
    cuts = sorted((breaks if breaks is not None else pauses(audio))[:k])
    edges = [s] + [x for g in cuts for x in g] + [e]
    return [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2)]


# ───────────────────────── captions ─────────────────────────

def phrase_split(text: str) -> list[str]:
    words, out, cur = text.split(), [], []
    for w in words:
        cur.append(w)
        if (re.search(r"[.,!?—;:]$", w) and len(cur) >= 3) or len(cur) >= 7:
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


def captions_for(text: str, spans: list[tuple[float, float]]) -> list[dict]:
    """Spread the line's phrases over the speech spans (by character count).

    A caption change that lands near one of the clip's pauses is moved onto it, so the next caption
    appears as he starts that phrase, not mid-word. Cues stay back to back (no blank gaps).
    """
    phrases = phrase_split(text)
    total_len = sum(len(p) for p in phrases) or 1
    talk = sum(e - s for s, e in spans) or 1.0
    def at(talk_t: float) -> float:
        acc = 0.0
        for s, e in spans:
            if talk_t <= acc + (e - s):
                return s + (talk_t - acc)
            acc += e - s
        return spans[-1][1]
    bounds, pos = [], 0.0  # talk-time position of each caption change
    for p in phrases[:-1]:
        pos += talk * len(p) / total_len
        bounds.append(pos)
    times = [at(b) for b in bounds]
    acc = 0.0
    for (s, e), (resume, _) in zip(spans, spans[1:]):  # each pause: talk-time position → speech resumes
        acc += e - s
        i = min(range(len(bounds)), key=lambda j: abs(bounds[j] - acc), default=None)
        if i is not None and abs(bounds[i] - acc) <= 0.45:
            prev, nxt = times[i - 1] if i else spans[0][0], times[i + 1] if i + 1 < len(times) else spans[-1][1]
            if prev < resume < nxt:
                times[i] = resume
    starts, ends = [spans[0][0], *times], [*times, spans[-1][1]]
    return [{"start": round(s, 3), "end": round(e, 3), "text": p} for s, e, p in zip(starts, ends, phrases)]


# ───────────────────────── encode ─────────────────────────

def encode_clip(src: Path, rect: tuple[int, int, int, int], key: np.ndarray, dest: Path,
                keep_src_audio: bool, start: float = 0.0, speed: float = 1.0) -> None:
    cw, ch, left, top = rect
    hexkey = "0x%02X%02X%02X" % tuple(int(c) for c in key)
    matte = "".join(
        f"drawbox=x=iw*{x0}:y=ih*{y0}:w=iw*{x1 - x0:.4f}:h=ih*{y1 - y0:.4f}:color={hexkey}:t=fill,"
        for x0, y0, x1, y1 in GARBAGE
    )
    graph = (
        f"[0:v]setpts=(PTS-STARTPTS)/{speed},fps={FPS},{matte}crop={cw}:{ch}:{left}:{top},scale={OUT_W}:{OUT_H}:flags=lanczos,"
        f"chromakey={hexkey}:{KEY_SIMILARITY}:{KEY_BLEND},despill=type=green:mix=0.6:expand=0,"
        f"format=rgba,split[c][a];"
        f"[c]format=rgb24,format=yuv420p[cc];"
        f"[a]alphaextract,lut=c0='clip((val-10)*255/215,0,255)',format=yuv420p[am];"  # levels: near-clear → 0, near-solid → 255 (codec noise otherwise leaves the body ~4% see-through)
        f"[cc][am]vstack=inputs=2,format=yuv420p[v]"
    )
    cmd = ["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.3f}", "-i", str(src), "-filter_complex", graph, "-map", "[v]"]
    if keep_src_audio:
        cmd += ["-map", "0:a?", "-c:a", "aac", "-b:a", "128k"]
    else:
        cmd += ["-an"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    run(cmd + [str(dest)])


def rgba_frame(stacked_mp4: Path, t: float = 0.0) -> Image.Image:
    f = grab_frame(stacked_mp4, t, OUT_W, OUT_H * 2)
    rgb = f[:OUT_H]
    alpha = f[OUT_H:, :, 0]
    return Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")


def bust_from(img: Image.Image, dest: Path) -> None:
    a = np.array(img)[:, :, 3]
    rows = np.where(a.max(axis=1) > 128)[0]
    cols = np.where(a.max(axis=0) > 128)[0]
    if rows.size == 0:
        return
    top, bottom = rows[0], rows[-1]
    head_h = (bottom - top) * 0.34
    cx = (cols[0] + cols[-1]) / 2
    bw = head_h * 0.8
    box = (int(max(0, cx - bw / 2)), int(max(0, top - head_h * 0.06)), int(min(OUT_W, cx + bw / 2)), int(min(OUT_H, top + head_h * 0.94)))
    img.crop(box).resize((480, 600), Image.LANCZOS).save(dest, quality=88)


# ───────────────────────── main ─────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--inbox", default=str(ROOT / "assets-inbox"))
    ap.add_argument("--out", default=str(ROOT / "public" / "hero"))
    args = ap.parse_args()
    inbox, out = Path(args.inbox), Path(args.out)
    for tool in ("ffmpeg", "ffprobe"):
        need(tool)

    found = {name: find_clip(inbox, stem) for name, (stem, _, _) in CLIPS.items()}
    found = {k: v for k, v in found.items() if v}
    if "intro" not in found:
        sys.exit(f"error: put at least {CLIPS['intro'][0]}.mp4 in {inbox} (see avatar/PROMPTS.md)")

    lines = [l.strip() for l in SCRIPT_FILE.read_text(encoding="utf-8").splitlines() if l.strip()] if SCRIPT_FILE.exists() else []
    script = {"intro": lines[0] if lines else "", "offer": lines[1] if len(lines) > 1 else ""}

    metas = {k: probe(p) for k, p in found.items()}
    first = found["intro"]
    key = key_colour(first, metas["intro"])
    print(f"key    backdrop sampled as rgb({key[0]:.0f}, {key[1]:.0f}, {key[2]:.0f})")

    # one framing window for all clips, so switching clips never makes him jump
    boxes = [subject_box(p, metas[k], key) for k, p in found.items()]
    boxes = [b for b in boxes if b]
    if not boxes:
        sys.exit("error: no subject found against the green; is the backdrop chroma green?")
    union = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    m0 = metas["intro"]
    rect = crop_window(union, m0["w"], m0["h"])
    print(f"frame  {rect[0]}x{rect[1]} at ({rect[2]},{rect[3]}) -> {OUT_W}x{OUT_H} (stacked {OUT_W}x{OUT_H * 2})")

    out.mkdir(parents=True, exist_ok=True)
    manifest: dict = {"version": 2, "format": "stacked-alpha", "width": OUT_W, "height": OUT_H, "fps": FPS, "clips": {}}

    with tempfile.TemporaryDirectory(dir=str(out.parent)) as tmp:
        work = Path(tmp)
        for name, src in found.items():
            stem, speaks, loops = CLIPS[name]
            meta = metas[name]
            if (meta["w"], meta["h"]) != (m0["w"], m0["h"]):
                print(f"warn   {src.name} is {meta['w']}x{meta['h']}, intro is {m0['w']}x{m0['h']}; framing may differ")
            start, speed = (WAVE_START, WAVE_SPEED) if name == "wave" else (0.0, 1.0)
            duration = (meta["duration"] - start) / speed
            entry: dict = {"src": f"/hero/{name}.mp4", "duration": round(duration, 3), "hasAudio": False}
            if speaks and meta["has_audio"]:
                clip_wav = work / f"{name}-clip.wav"
                run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", str(AUDIO_RATE), str(clip_wav)])
                audio = load_audio(clip_wav)
                # caption spans = the clip's phrases, split at its real mouth pauses (>= 0.22 s, up to 3)
                breaks = [g for g in pauses(audio) if g[1] - g[0] >= 0.22]
                spans = chunks(audio, min(3, len(breaks)), breaks)
                entry["hasAudio"] = True
                entry["speech"] = {"start": round(spans[0][0], 3), "end": round(spans[-1][1], 3)}
                entry["captions"] = captions_for(script.get(name, ""), spans) if script.get(name) else []
                entry["voice"] = "generated"
            if loops:
                entry["loop"] = True
            encode_clip(src, rect, key, out / f"{name}.mp4", keep_src_audio=speaks, start=start, speed=speed)
            manifest["clips"][name] = entry
            cut_note = f" (from {meta['duration']:.2f}s: skip {start:g}s, {speed:g}x)" if speed != 1.0 else ""
            print(f"clip   {name}: {duration:.2f}s{cut_note}{' + captions' if entry.get('captions') else ''}")

    manifest["sequence"] = [c for c in SEQUENCE if c in manifest["clips"]]
    first_clip = out / f"{manifest['sequence'][0]}.mp4"
    rgba_frame(first_clip).save(out / "poster.png", optimize=True)
    manifest["poster"] = "/hero/poster.png"
    bust_src = out / ("idle.mp4" if "idle" in manifest["clips"] else "intro.mp4")
    bust_from(rgba_frame(bust_src), out / "portrait-bust.webp")
    manifest["bust"] = "/hero/portrait-bust.webp"

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    sizes = ", ".join(f"{p.name} {math.ceil(p.stat().st_size / 1024)} KB" for p in sorted(out.iterdir()) if p.is_file())
    print(f"wrote  {sizes}")


if __name__ == "__main__":
    main()
