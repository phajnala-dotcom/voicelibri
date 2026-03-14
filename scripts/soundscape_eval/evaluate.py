"""
VoiceLibri Soundscape Evaluation Tool v2
=========================================

Automated evaluation of soundscape pipeline output quality.
Uses 7 criteria driven by pipeline data (resolution JSONs) and audio analysis.

Criteria (weights sum to 100):
  1. ambientOccurrence  (15) — Ambient environments resolved vs expected
  2. sfxOccurrence      (15) — SFX events resolved vs expected
  3. ambientSimilarity  (15) — Average cosine similarity of ambient assets
  4. sfxSimilarity      (15) — Average cosine similarity of SFX assets
  5. ambientCoverage    (15) — Temporal coverage: ambient duration / voice duration
  6. ambientVolume      (15) — LUFS offset from voice (EBU R128)
  7. sfxAudibility      (10) — SFX loudness contrast above ambient bed

Data sources:
  - soundscape_resolution_chapter_N.json (asset resolution with cosine scores)
  - scene_analysis_chapter_N.json (LLM scene analysis — informational)
  - Audio files (FFmpeg analysis for LUFS, duration, spikes)
  - ideal_template.json (human-curated ground truth)

Usage:
  python scripts/soundscape_eval/evaluate.py <audiobook_dir> [options]

Options:
  --gate <gate_id>       Gate identifier (e.g. "0", "1", "2a") for tracking
  --attempt <number>     Attempt number within this gate (default: auto-increment)
  --notes <text>         Free-text annotation for this evaluation run

Examples:
  python scripts/soundscape_eval/evaluate.py "audiobooks/soundscape_test_story_Gate 0.1"
  python scripts/soundscape_eval/evaluate.py "audiobooks/soundscape_test_story_Gate 0.1" --gate 0 --attempt 1 --notes "Baseline - 7 criteria"

Output:
  - Detailed per-chapter analysis to console
  - Summary scorecard with total score (0-100)
  - JSON report at <audiobook_dir>/soundscape_eval_report.json
  - Append row to scripts/soundscape_eval/tracking.csv (cumulative history)
"""

import csv
import json
import os
import re
import subprocess
import sys
import glob
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from datetime import datetime


# ========================================
# Configuration
# ========================================

SCRIPT_DIR = Path(__file__).parent
TEMPLATE_PATH = SCRIPT_DIR / "ideal_template.json"
TRACKING_CSV_PATH = SCRIPT_DIR / "tracking.csv"


# ========================================
# Data Classes
# ========================================

@dataclass
class AudioInfo:
    """Audio file analysis results from ffprobe/ffmpeg."""
    path: str
    exists: bool = False
    duration_sec: float = 0.0
    mean_volume_db: float = -100.0
    max_volume_db: float = -100.0
    lufs: float = -100.0  # EBU R128 integrated loudness
    sample_rate: int = 0
    channels: int = 0
    codec: str = ""
    volume_spikes: list = field(default_factory=list)   # [{time_sec, rms_db}]
    silence_regions: list = field(default_factory=list)  # [{start_sec, end_sec}]


@dataclass
class ResolutionData:
    """Parsed data from soundscape_resolution_chapter_N.json."""
    ambient_count: int = 0
    ambient_resolved: int = 0   # How many got a non-null asset
    ambient_scores: list = field(default_factory=list)   # cosine similarity scores
    ambient_details: list = field(default_factory=list)  # [{environment, asset, score}]
    sfx_count: int = 0
    sfx_resolved: int = 0
    sfx_scores: list = field(default_factory=list)
    sfx_details: list = field(default_factory=list)      # [{query, description, asset, score}]


@dataclass
class ChapterEval:
    """Evaluation results for a single chapter."""
    chapter_index: int
    chapter_title: str = ""
    # File presence
    voice_file: Optional[AudioInfo] = None
    ambient_file: Optional[AudioInfo] = None
    mixed_file: Optional[AudioInfo] = None
    subchunk_count: int = 0
    # Resolution data (from pipeline JSONs)
    resolution: Optional[ResolutionData] = None
    # Scene analysis (informational)
    scene_segment_count: int = 0
    sfx_event_count: int = 0
    # Audio quality metrics
    ambient_voice_duration_ratio: float = 0.0
    sfx_spike_count: int = 0
    # Scores (0-100 per criterion)
    scores: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)


@dataclass
class EvalReport:
    """Complete evaluation report."""
    audiobook_dir: str
    template_name: str = ""
    timestamp: str = ""
    chapters: list = field(default_factory=list)
    total_score: float = 0.0
    max_score: float = 100.0
    grade: str = ""
    summary: list = field(default_factory=list)
    # Gate tracking
    gate: str = ""
    attempt: int = 0
    notes_text: str = ""


# ========================================
# FFprobe / FFmpeg Analysis
# ========================================

def run_ffprobe(filepath: str) -> dict:
    """Get audio file metadata using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format", "-show_streams",
                filepath,
            ],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except Exception as e:
        print(f"  ⚠ ffprobe failed for {filepath}: {e}")
    return {}


def analyze_volume(filepath: str) -> tuple[float, float]:
    """Get mean and max volume using ffmpeg volumedetect filter."""
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", filepath,
                "-af", "volumedetect",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=60,
        )
        stderr = result.stderr
        mean_match = re.search(r"mean_volume:\s*([-\d.]+)\s*dB", stderr)
        max_match = re.search(r"max_volume:\s*([-\d.]+)\s*dB", stderr)
        mean = float(mean_match.group(1)) if mean_match else -100.0
        max_vol = float(max_match.group(1)) if max_match else -100.0
        return mean, max_vol
    except Exception as e:
        print(f"  ⚠ Volume analysis failed for {filepath}: {e}")
    return -100.0, -100.0


def measure_lufs(filepath: str) -> float:
    """
    Measure EBU R128 integrated loudness (LUFS) using ffmpeg ebur128 filter.
    Returns integrated LUFS value, or -100.0 on failure.
    """
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", filepath,
                "-af", "ebur128=peak=true",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=120,
        )
        # ebur128 outputs "I: -70.0 LUFS" in per-frame lines AND in the final
        # Summary section. We need the LAST occurrence (the final integrated value).
        lufs_matches = re.findall(r"I:\s+([-\d.]+)\s+LUFS", result.stderr)
        lufs_match = lufs_matches[-1] if lufs_matches else None
        if lufs_match:
            return float(lufs_match)
    except Exception as e:
        print(f"  ⚠ LUFS measurement failed for {filepath}: {e}")
    return -100.0


def detect_volume_spikes(filepath: str, window_sec: float = 0.5) -> list[dict]:
    """
    Detect volume spikes (potential SFX events) using astats filter.
    Returns list of {time_sec, rms_db} where volume jumps significantly.
    """
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", filepath,
                "-af", f"astats=metadata=1:reset={int(1/window_sec)},"
                       f"ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=120,
        )
        spikes = []
        lines = result.stdout.split("\n") if result.stdout else result.stderr.split("\n")
        prev_rms = -100.0
        for line in lines:
            time_match = re.search(r"pts_time:([\d.]+)", line)
            rms_match = re.search(r"RMS_level=([-\d.]+)", line)
            if time_match and rms_match:
                t = float(time_match.group(1))
                rms = float(rms_match.group(1))
                # A spike = RMS jumps up by more than 6 dB from previous window
                if rms - prev_rms > 6 and rms > -40:
                    spikes.append({"time_sec": round(t, 2), "rms_db": round(rms, 1)})
                prev_rms = rms
        return spikes
    except Exception:
        pass
    return []


def detect_silence_regions(filepath: str, threshold_db: float = -45, min_duration: float = 0.3) -> list[dict]:
    """Detect silence regions in audio file."""
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", filepath,
                "-af", f"silencedetect=noise={threshold_db}dB:d={min_duration}",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=60,
        )
        regions = []
        starts = re.findall(r"silence_start:\s*([\d.]+)", result.stderr)
        ends = re.findall(r"silence_end:\s*([\d.]+)", result.stderr)
        for s, e in zip(starts, ends):
            regions.append({"start_sec": round(float(s), 2), "end_sec": round(float(e), 2)})
        return regions
    except Exception:
        pass
    return []


def analyze_audio_file(filepath: str, detailed: bool = True) -> AudioInfo:
    """Complete analysis of an audio file."""
    info = AudioInfo(path=filepath)

    if not os.path.exists(filepath):
        return info

    info.exists = True

    # Basic metadata
    probe = run_ffprobe(filepath)
    if probe:
        fmt = probe.get("format", {})
        info.duration_sec = float(fmt.get("duration", 0))
        streams = probe.get("streams", [])
        if streams:
            s = streams[0]
            info.sample_rate = int(s.get("sample_rate", 0))
            info.channels = int(s.get("channels", 0))
            info.codec = s.get("codec_name", "")

    # Volume analysis (dB)
    info.mean_volume_db, info.max_volume_db = analyze_volume(filepath)

    # LUFS measurement (EBU R128)
    info.lufs = measure_lufs(filepath)

    if detailed:
        # Volume spikes (SFX detection)
        info.volume_spikes = detect_volume_spikes(filepath)
        # Silence regions
        info.silence_regions = detect_silence_regions(filepath)

    return info


# ========================================
# Pipeline JSON Parsing
# ========================================

def parse_resolution_json(audiobook_dir: str, chapter_index: int) -> Optional[ResolutionData]:
    """
    Parse soundscape_resolution_chapter_N.json saved by the pipeline.
    Contains cosine similarity scores for ambient and SFX asset resolution.
    """
    json_path = os.path.join(audiobook_dir, f"soundscape_resolution_chapter_{chapter_index}.json")
    if not os.path.exists(json_path):
        return None

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        res = ResolutionData()

        # Ambient resolutions
        for amb in data.get("ambientResolutions", []):
            res.ambient_count += 1
            score = amb.get("cosineSimilarity", 0)
            asset = amb.get("resolvedAsset")
            if asset:
                res.ambient_resolved += 1
                res.ambient_scores.append(score)
            res.ambient_details.append({
                "environment": amb.get("environment", ""),
                "asset": asset.get("description", "") if asset else None,
                "score": score,
            })

        # SFX resolutions
        for sfx in data.get("sfxResolutions", []):
            res.sfx_count += 1
            score = sfx.get("cosineSimilarity", 0)
            asset = sfx.get("resolvedAsset")
            if asset:
                res.sfx_resolved += 1
                res.sfx_scores.append(score)
            res.sfx_details.append({
                "query": sfx.get("query", ""),
                "description": sfx.get("description", ""),
                "asset": asset.get("description", "") if asset else None,
                "score": score,
            })

        return res
    except Exception as e:
        print(f"  ⚠ Failed to parse resolution JSON: {e}")
    return None


def parse_scene_analysis_json(audiobook_dir: str, chapter_index: int) -> Optional[dict]:
    """
    Parse scene_analysis_chapter_N.json saved by the pipeline.
    Contains LLM scene analysis: sceneSegments, sfxEvents, etc.
    """
    json_path = os.path.join(audiobook_dir, f"scene_analysis_chapter_{chapter_index}.json")
    if not os.path.exists(json_path):
        return None

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  ⚠ Failed to parse scene analysis JSON: {e}")
    return None


# ========================================
# Scoring Engine (7 Criteria)
# ========================================

def score_chapter(chapter_eval: ChapterEval, template_chapter: dict, scoring: dict, audiobook_dir: str) -> dict:
    """
    Score a single chapter against the ideal template using 7 criteria.
    Each criterion scores 0-100, weighted by scoring["weights"].

    Data sources:
      - Resolution JSON (cosine similarity scores from pipeline)
      - Audio files (LUFS, duration, volume spikes)
      - Template (expected counts, LUFS targets)
    """
    scores = {}
    res = chapter_eval.resolution
    lufs_targets = scoring.get("lufsTargets", {})

    # ── 1. ambientOccurrence (15%) ──────────────────────────────
    # How many ambient environments were resolved (with assets) vs expected count?
    expected_amb = template_chapter.get("expectedAmbientCount", 0)
    if expected_amb > 0 and res:
        scores["ambientOccurrence"] = round(100 * min(1.0, res.ambient_resolved / expected_amb), 1)
    elif expected_amb > 0:
        scores["ambientOccurrence"] = 0
        chapter_eval.notes.append("No resolution data — ambientOccurrence=0")
    else:
        scores["ambientOccurrence"] = 100  # No ambient expected

    # ── 2. sfxOccurrence (15%) ──────────────────────────────────
    # How many SFX events were resolved (with assets) vs expected count?
    expected_sfx = template_chapter.get("expectedSfxCount", 0)
    if expected_sfx > 0 and res:
        scores["sfxOccurrence"] = round(100 * min(1.0, res.sfx_resolved / expected_sfx), 1)
    elif expected_sfx > 0:
        scores["sfxOccurrence"] = 0
        chapter_eval.notes.append("No resolution data — sfxOccurrence=0")
    else:
        scores["sfxOccurrence"] = 100

    # ── 3. ambientSimilarity (15%) ──────────────────────────────
    # Average cosine similarity of resolved ambient assets (from pipeline)
    if res and res.ambient_scores:
        avg_sim = sum(res.ambient_scores) / len(res.ambient_scores)
        # Cosine similarity 0.0→0, 1.0→100
        scores["ambientSimilarity"] = round(100 * avg_sim, 1)
    else:
        scores["ambientSimilarity"] = 0
        if not res:
            chapter_eval.notes.append("No resolution data — ambientSimilarity=0")

    # ── 4. sfxSimilarity (15%) ──────────────────────────────────
    # Average cosine similarity of resolved SFX assets (from pipeline)
    if res and res.sfx_scores:
        avg_sim = sum(res.sfx_scores) / len(res.sfx_scores)
        scores["sfxSimilarity"] = round(100 * avg_sim, 1)
    else:
        scores["sfxSimilarity"] = 0
        if not res:
            chapter_eval.notes.append("No resolution data — sfxSimilarity=0")

    # ── 5. ambientCoverage (15%) ────────────────────────────────
    # Purely temporal: what fraction of chapter voice duration is covered by ambient?
    if (chapter_eval.voice_file and chapter_eval.voice_file.exists and
            chapter_eval.ambient_file and chapter_eval.ambient_file.exists and
            chapter_eval.voice_file.duration_sec > 0):
        ratio = min(1.0, chapter_eval.ambient_voice_duration_ratio)
        scores["ambientCoverage"] = round(100 * ratio, 1)
    else:
        scores["ambientCoverage"] = 0
        if not (chapter_eval.ambient_file and chapter_eval.ambient_file.exists):
            chapter_eval.notes.append("No ambient file — ambientCoverage=0")

    # ── 6. ambientVolume (15%) — LUFS ───────────────────────────
    # Is ambient LUFS in target range relative to voice?
    # Target: ambient should be (voice + ambientOffsetFromVoice) LUFS, ±toleranceLufs
    #
    # The pipeline applies LUFS normalization during mixing (G1-B), so the raw
    # _soundscape.ogg file has PRE-normalization levels. We use the persisted
    # lufs_normalization_chapter_N.json for the EFFECTIVE ambient LUFS.
    # Fallback: raw ambient LUFS if normalization JSON not available.
    target_offset = lufs_targets.get("ambientOffsetFromVoice", -15)
    tolerance = lufs_targets.get("toleranceLufs", 3)

    # Try to load LUFS normalization data from pipeline
    lufs_norm_path = os.path.join(audiobook_dir, f"lufs_normalization_chapter_{chapter_eval.chapter_index}.json")
    voice_lufs = None
    ambient_lufs = None
    lufs_source = "raw"

    if os.path.exists(lufs_norm_path):
        try:
            with open(lufs_norm_path, "r", encoding="utf-8") as lf:
                lufs_norm = json.load(lf)
            voice_lufs = lufs_norm.get("voiceLufs")
            effective = lufs_norm.get("effectiveAmbientLufs")
            if voice_lufs is not None and effective is not None:
                ambient_lufs = effective
                lufs_source = "normalized"
        except Exception:
            pass

    # Fallback to raw file measurement
    if voice_lufs is None and chapter_eval.voice_file and chapter_eval.voice_file.exists:
        voice_lufs = chapter_eval.voice_file.lufs if chapter_eval.voice_file.lufs > -100 else None
    if ambient_lufs is None and chapter_eval.ambient_file and chapter_eval.ambient_file.exists:
        ambient_lufs = chapter_eval.ambient_file.lufs if chapter_eval.ambient_file.lufs > -100 else None

    if voice_lufs is not None and ambient_lufs is not None:
        actual_offset = ambient_lufs - voice_lufs  # Should be close to target_offset
        deviation = abs(actual_offset - target_offset)

        if deviation <= tolerance:
            scores["ambientVolume"] = 100
        elif deviation <= tolerance * 2:
            # Linear falloff: 100→50 over one tolerance width
            scores["ambientVolume"] = round(100 - 50 * (deviation - tolerance) / tolerance, 1)
        elif deviation <= tolerance * 4:
            # Linear falloff: 50→0 over two tolerance widths
            scores["ambientVolume"] = round(
                max(0, 50 * (1 - (deviation - tolerance * 2) / (tolerance * 2))), 1
            )
        else:
            scores["ambientVolume"] = 0

        chapter_eval.notes.append(
            f"LUFS [{lufs_source}]: voice={voice_lufs:.1f}, ambient={ambient_lufs:.1f}, "
            f"offset={actual_offset:.1f} (target={target_offset}, tol=±{tolerance})"
        )
    else:
        scores["ambientVolume"] = 0
        if (chapter_eval.ambient_file and chapter_eval.ambient_file.exists and
                chapter_eval.ambient_file.lufs <= -100):
            chapter_eval.notes.append("LUFS measurement failed for ambient — ambientVolume=0")
        elif not (chapter_eval.voice_file and chapter_eval.voice_file.exists):
            chapter_eval.notes.append("Voice file missing — ambientVolume=0")

    # ── 7. sfxAudibility (10%) — LUFS contrast ─────────────────
    # Are SFX events perceptibly louder than the ambient bed?
    # Uses volume spikes detected in the mixed track (voice+soundscape) as proxy.
    # Prefer mixed_file (post-normalization) over raw ambient_file.
    sfx_source_file = chapter_eval.mixed_file if (chapter_eval.mixed_file and chapter_eval.mixed_file.exists) else chapter_eval.ambient_file
    if (sfx_source_file and sfx_source_file.exists and
            sfx_source_file.volume_spikes):
        spike_rms_values = [s["rms_db"] for s in sfx_source_file.volume_spikes]
        ambient_mean = sfx_source_file.mean_volume_db

        if spike_rms_values and ambient_mean > -100:
            avg_spike_rms = sum(spike_rms_values) / len(spike_rms_values)
            spike_contrast = avg_spike_rms - ambient_mean  # dB above ambient mean

            # Ideal: SFX should be at least 6dB above ambient bed
            if spike_contrast >= 6:
                scores["sfxAudibility"] = 100
            elif spike_contrast >= 3:
                scores["sfxAudibility"] = round(50 + 50 * (spike_contrast - 3) / 3, 1)
            elif spike_contrast > 0:
                scores["sfxAudibility"] = round(50 * spike_contrast / 3, 1)
            else:
                scores["sfxAudibility"] = 0
                chapter_eval.notes.append(
                    f"SFX not audible above ambient (contrast={spike_contrast:.1f}dB)"
                )
        else:
            scores["sfxAudibility"] = 0
    else:
        scores["sfxAudibility"] = 0
        if chapter_eval.resolution and chapter_eval.resolution.sfx_resolved > 0:
            chapter_eval.notes.append("SFX resolved but no volume spikes detected in audio")

    return scores


def compute_weighted_score(scores: dict, weights: dict) -> float:
    """Compute weighted total score from individual criterion scores."""
    total_weight = sum(weights.values())
    weighted_sum = sum(scores.get(k, 0) * w for k, w in weights.items())
    return round(weighted_sum / total_weight, 1) if total_weight > 0 else 0


def grade_from_score(score: float) -> str:
    """Convert numeric score to letter grade."""
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    elif score >= 40:
        return "E"
    else:
        return "F"


# ========================================
# File Discovery
# ========================================

def discover_chapter_files(audiobook_dir: str) -> dict[int, dict]:
    """
    Discover chapter voice and ambient files in an audiobook directory.
    Supports two naming conventions:
      Legacy:  chapter_N.ogg, chapter_N_soundscape.ogg
      Current: NN_N Title.ogg, NN_N Title_soundscape.ogg
    Returns {chapter_index: {voice, ambient, mixed, subchunks}}
    """
    chapters = {}

    all_oggs = sorted(glob.glob(os.path.join(audiobook_dir, "*.ogg")))

    for f in all_oggs:
        basename = os.path.basename(f)
        name_no_ext = os.path.splitext(basename)[0]

        if name_no_ext.endswith("_soundscape") or name_no_ext.endswith("_intro") or name_no_ext.endswith("_mixed"):
            continue

        ch_match = re.match(r"chapter_(\d+)$", name_no_ext)
        if ch_match:
            ch_idx = int(ch_match.group(1))
        else:
            new_match = re.match(r"\d+_(\d+)\s", name_no_ext)
            if new_match:
                ch_idx = int(new_match.group(1))
            else:
                continue

        if ch_idx not in chapters:
            chapters[ch_idx] = {"voice": None, "ambient": None, "mixed": None, "subchunks": []}
        chapters[ch_idx]["voice"] = f

        for suffix, key in [("_soundscape", "ambient"), ("_mixed", "mixed")]:
            related = os.path.join(audiobook_dir, f"{name_no_ext}{suffix}.ogg")
            if os.path.exists(related):
                chapters[ch_idx][key] = related

    # Find subchunk files
    for f in sorted(glob.glob(os.path.join(audiobook_dir, "temp", "subchunk_*_*.wav"))):
        basename = os.path.basename(f)
        sc_match = re.match(r"subchunk_(\d+)_(\d+)\.wav$", basename)
        if sc_match:
            ch_idx = int(sc_match.group(1))
            if ch_idx in chapters:
                chapters[ch_idx]["subchunks"].append(f)

    # Fallback: recursive search in subdirectories
    if not chapters:
        for f in sorted(glob.glob(os.path.join(audiobook_dir, "**", "*.ogg"), recursive=True)):
            basename = os.path.basename(f)
            name_no_ext = os.path.splitext(basename)[0]
            if name_no_ext.endswith("_soundscape") or name_no_ext.endswith("_intro") or name_no_ext.endswith("_mixed"):
                continue
            ch_match = re.match(r"chapter_(\d+)$", name_no_ext)
            if ch_match:
                ch_idx = int(ch_match.group(1))
            else:
                new_match = re.match(r"\d+_(\d+)\s", name_no_ext)
                if new_match:
                    ch_idx = int(new_match.group(1))
                else:
                    continue
            if ch_idx not in chapters:
                chapters[ch_idx] = {"voice": f, "ambient": None, "mixed": None, "subchunks": []}
            dir_path = os.path.dirname(f)
            for suffix, key in [("_soundscape", "ambient"), ("_mixed", "mixed")]:
                related = os.path.join(dir_path, f"{name_no_ext}{suffix}.ogg")
                if os.path.exists(related):
                    chapters[ch_idx][key] = related

    return chapters


# ========================================
# Main Evaluation Logic
# ========================================

def evaluate_audiobook(audiobook_dir: str) -> EvalReport:
    """Run full evaluation of a generated audiobook against the ideal template."""

    if not TEMPLATE_PATH.exists():
        print(f"❌ Template not found: {TEMPLATE_PATH}")
        sys.exit(1)

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = json.load(f)

    scoring = template["scoring"]
    weights = scoring["weights"]

    report = EvalReport(
        audiobook_dir=audiobook_dir,
        template_name=template.get("title", "unknown"),
        timestamp=datetime.now().isoformat(),
    )

    # Discover files
    print(f"\n📁 Scanning: {audiobook_dir}")
    chapter_files = discover_chapter_files(audiobook_dir)

    if not chapter_files:
        print("❌ No chapter files found! Generate the audiobook first.")
        print(f"   Expected files like: chapter_1.ogg, chapter_1_soundscape.ogg in {audiobook_dir}")
        report.summary.append("No chapter files found")
        report.total_score = 0
        report.grade = "F"
        return report

    print(f"   Found {len(chapter_files)} chapter(s): {sorted(chapter_files.keys())}")

    # Evaluate each chapter
    for ch_idx in sorted(chapter_files.keys()):
        files = chapter_files[ch_idx]

        # Find matching template chapter
        template_chapter = None
        for tc in template["chapters"]:
            if tc["chapterIndex"] == ch_idx:
                template_chapter = tc
                break

        if not template_chapter:
            print(f"\n  ⚠ Chapter {ch_idx}: No template entry — skipping scoring")
            continue

        print(f"\n{'='*60}")
        print(f"📖 Chapter {ch_idx}: {template_chapter.get('title', '')}")
        print(f"{'='*60}")

        chapter_eval = ChapterEval(
            chapter_index=ch_idx,
            chapter_title=template_chapter.get("title", ""),
        )

        # ── Load pipeline JSONs ──
        resolution = parse_resolution_json(audiobook_dir, ch_idx)
        if resolution:
            chapter_eval.resolution = resolution
            print(f"  📋 Resolution JSON: {resolution.ambient_resolved}/{resolution.ambient_count} ambient, "
                  f"{resolution.sfx_resolved}/{resolution.sfx_count} SFX")
            if resolution.ambient_details:
                print(f"  🌿 Ambient resolutions:")
                for amb in resolution.ambient_details:
                    status = "✓" if amb["asset"] else "✗"
                    asset_desc = amb['asset'][:45] if amb['asset'] else 'unresolved'
                    print(f"     {status} \"{amb['environment']}\" → \"{asset_desc}\" (sim={amb['score']:.3f})")
            if resolution.sfx_details:
                print(f"  🎯 SFX resolutions:")
                for sfx in resolution.sfx_details:
                    status = "✓" if sfx["asset"] else "✗"
                    desc = sfx['description'][:40] if sfx['description'] else sfx['query'][:40]
                    asset_desc = (sfx['asset'][:35] if sfx['asset'] else 'unresolved')
                    print(f"     {status} \"{desc}\" → \"{asset_desc}\" (sim={sfx['score']:.3f})")
        else:
            print(f"  ⚠ No resolution JSON found — criteria 1-4 will score 0")
            chapter_eval.notes.append("soundscape_resolution_chapter_N.json not found")

        scene = parse_scene_analysis_json(audiobook_dir, ch_idx)
        if scene:
            chapter_eval.scene_segment_count = len(scene.get("sceneSegments", []))
            chapter_eval.sfx_event_count = len(scene.get("sfxEvents", []))
            print(f"  📊 Scene analysis: {chapter_eval.scene_segment_count} segments, "
                  f"{chapter_eval.sfx_event_count} SFX events, "
                  f"timeOfDay={scene.get('timeOfDay', '?')}, "
                  f"weather={scene.get('weather', '?')}")
        else:
            print(f"  ℹ No scene analysis JSON found (informational only)")

        # ── Analyze audio files ──
        if files["voice"]:
            print(f"  🎤 Voice: {os.path.basename(files['voice'])}")
            chapter_eval.voice_file = analyze_audio_file(files["voice"], detailed=False)
            print(f"     Duration: {chapter_eval.voice_file.duration_sec:.1f}s, "
                  f"Volume: mean={chapter_eval.voice_file.mean_volume_db:.1f}dB, "
                  f"LUFS={chapter_eval.voice_file.lufs:.1f}")
        else:
            print(f"  🎤 Voice: NOT FOUND")
            chapter_eval.notes.append("Voice file missing")

        if files["ambient"]:
            print(f"  🌿 Ambient: {os.path.basename(files['ambient'])}")
            chapter_eval.ambient_file = analyze_audio_file(files["ambient"], detailed=True)
            print(f"     Duration: {chapter_eval.ambient_file.duration_sec:.1f}s, "
                  f"Volume: mean={chapter_eval.ambient_file.mean_volume_db:.1f}dB, "
                  f"LUFS={chapter_eval.ambient_file.lufs:.1f}")
            print(f"     Volume spikes (potential SFX): {len(chapter_eval.ambient_file.volume_spikes)}")
            chapter_eval.sfx_spike_count = len(chapter_eval.ambient_file.volume_spikes)
            if chapter_eval.ambient_file.volume_spikes:
                for spike in chapter_eval.ambient_file.volume_spikes[:8]:
                    print(f"       @ {spike['time_sec']:.1f}s: {spike['rms_db']:.1f}dB")
                if len(chapter_eval.ambient_file.volume_spikes) > 8:
                    print(f"       ... and {len(chapter_eval.ambient_file.volume_spikes) - 8} more")
        else:
            print(f"  🌿 Ambient: NOT FOUND")
            chapter_eval.notes.append("Ambient file missing — soundscape not generated")

        if files["mixed"]:
            print(f"  🔀 Mixed: {os.path.basename(files['mixed'])}")
            chapter_eval.mixed_file = analyze_audio_file(files["mixed"], detailed=True)
            print(f"     Duration: {chapter_eval.mixed_file.duration_sec:.1f}s, "
                  f"Volume: mean={chapter_eval.mixed_file.mean_volume_db:.1f}dB, "
                  f"LUFS={chapter_eval.mixed_file.lufs:.1f}")
            print(f"     Volume spikes (potential SFX): {len(chapter_eval.mixed_file.volume_spikes)}")
            if chapter_eval.mixed_file.volume_spikes:
                for spike in chapter_eval.mixed_file.volume_spikes[:8]:
                    print(f"       @ {spike['time_sec']:.1f}s: {spike['rms_db']:.1f}dB")
                if len(chapter_eval.mixed_file.volume_spikes) > 8:
                    print(f"       ... and {len(chapter_eval.mixed_file.volume_spikes) - 8} more")

        # Subchunk count
        chapter_eval.subchunk_count = len(files.get("subchunks", []))
        if chapter_eval.subchunk_count:
            print(f"  📦 Subchunks: {chapter_eval.subchunk_count}")

        # Duration ratio
        if (chapter_eval.voice_file and chapter_eval.voice_file.exists and
                chapter_eval.ambient_file and chapter_eval.ambient_file.exists and
                chapter_eval.voice_file.duration_sec > 0):
            chapter_eval.ambient_voice_duration_ratio = (
                chapter_eval.ambient_file.duration_sec / chapter_eval.voice_file.duration_sec
            )
            print(f"  📏 Duration ratio (ambient/voice): {chapter_eval.ambient_voice_duration_ratio:.2f}")

        # ── Score this chapter ──
        chapter_eval.scores = score_chapter(chapter_eval, template_chapter, scoring, audiobook_dir)
        chapter_weighted = compute_weighted_score(chapter_eval.scores, weights)

        print(f"\n  📊 SCORES:")
        for criterion, score_val in chapter_eval.scores.items():
            weight = weights.get(criterion, 0)
            bar = "█" * int(score_val / 5) + "░" * (20 - int(score_val / 5))
            print(f"     {criterion:25s} {bar} {score_val:5.1f}/100  (w={weight})")
        print(f"     {'─'*62}")
        print(f"     {'WEIGHTED CHAPTER SCORE':25s} {'':20s} {chapter_weighted:5.1f}/100")

        if chapter_eval.notes:
            print(f"\n  📝 Notes:")
            for note in chapter_eval.notes:
                print(f"     • {note}")

        report.chapters.append(chapter_eval)

    # Overall score = average of chapter weighted scores
    if report.chapters:
        chapter_scores = [compute_weighted_score(ch.scores, weights) for ch in report.chapters]
        report.total_score = round(sum(chapter_scores) / len(chapter_scores), 1)
    else:
        report.total_score = 0

    report.grade = grade_from_score(report.total_score)

    return report


def print_summary(report: EvalReport):
    """Print the final summary with diagnosis."""
    print(f"\n{'='*60}")
    print(f"📊 SOUNDSCAPE EVALUATION SUMMARY")
    print(f"{'='*60}")
    print(f"  Audiobook:  {report.audiobook_dir}")
    print(f"  Template:   {report.template_name}")
    print(f"  Chapters:   {len(report.chapters)}")
    print(f"  Timestamp:  {report.timestamp}")
    if report.gate:
        print(f"  Gate:       {report.gate}  Attempt: {report.attempt or 'auto'}")
    print()

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        weights = json.load(f)["scoring"]["weights"]

    if report.chapters:
        for ch in report.chapters:
            ch_score = compute_weighted_score(ch.scores, weights)
            grade = grade_from_score(ch_score)
            print(f"  Chapter {ch.chapter_index} ({ch.chapter_title}): {ch_score:.1f}/100 [{grade}]")
            # Resolution summary
            if ch.resolution:
                if ch.resolution.ambient_scores:
                    avg_amb = sum(ch.resolution.ambient_scores) / len(ch.resolution.ambient_scores)
                    print(f"    Ambient: {ch.resolution.ambient_resolved}/{ch.resolution.ambient_count} resolved, "
                          f"avg_sim={avg_amb:.3f}")
                else:
                    print(f"    Ambient: {ch.resolution.ambient_resolved}/{ch.resolution.ambient_count} resolved")
                if ch.resolution.sfx_scores:
                    avg_sfx = sum(ch.resolution.sfx_scores) / len(ch.resolution.sfx_scores)
                    print(f"    SFX: {ch.resolution.sfx_resolved}/{ch.resolution.sfx_count} resolved, "
                          f"avg_sim={avg_sfx:.3f}")
                else:
                    print(f"    SFX: {ch.resolution.sfx_resolved}/{ch.resolution.sfx_count} resolved")
            if ch.ambient_file and ch.ambient_file.exists:
                print(f"    Audio: ambient={ch.ambient_file.duration_sec:.1f}s, "
                      f"LUFS={ch.ambient_file.lufs:.1f}, spikes={ch.sfx_spike_count}")
            else:
                print(f"    Audio: ambient MISSING")
    else:
        print("  No chapters evaluated.")

    bar_full = "█" * int(report.total_score / 5)
    bar_empty = "░" * (20 - int(report.total_score / 5))
    print(f"\n  TOTAL SCORE: {bar_full}{bar_empty} {report.total_score:.1f}/100  Grade: {report.grade}")
    print()

    # Diagnosis
    if report.total_score == 0:
        print("  💡 Score is 0 — no audiobook data or resolution JSONs found.")
        print("     1. Generate the audiobook with soundscape enabled")
        print("     2. Ensure soundscape_resolution_chapter_N.json files are saved")
        print("     3. Re-run this evaluation")
    elif report.total_score < 30:
        print("  💡 Score is very low. Key issues:")
        for ch in report.chapters:
            if ch.scores.get("ambientOccurrence", 0) == 0:
                print(f"     • Ch{ch.chapter_index}: No ambient assets resolved")
            if ch.scores.get("sfxOccurrence", 0) == 0:
                print(f"     • Ch{ch.chapter_index}: No SFX assets resolved")
            if ch.scores.get("ambientCoverage", 0) == 0:
                print(f"     • Ch{ch.chapter_index}: No ambient audio coverage")
            if ch.scores.get("ambientVolume", 0) == 0:
                print(f"     • Ch{ch.chapter_index}: Ambient volume out of range (LUFS)")
    elif report.total_score < 70:
        print("  💡 Moderate score. Look for improvements in:")
        for ch in report.chapters:
            low_scores = {k: v for k, v in ch.scores.items() if v < 50}
            if low_scores:
                items = ", ".join(f"{k}={v:.0f}" for k, v in low_scores.items())
                print(f"     • Ch{ch.chapter_index}: {items}")


def append_to_tracking_csv(report: EvalReport, weights: dict):
    """Append evaluation results as a new row to the cumulative tracking CSV."""
    csv_path = TRACKING_CSV_PATH
    file_exists = csv_path.exists()

    columns = [
        "timestamp", "audiobook_dir", "gate", "attempt",
        "total_score", "grade",
        "ch1_score", "ch1_grade", "ch2_score", "ch2_grade",
        "avg_ambientOccurrence", "avg_sfxOccurrence",
        "avg_ambientSimilarity", "avg_sfxSimilarity",
        "avg_ambientCoverage", "avg_ambientVolume",
        "avg_sfxAudibility",
        "notes",
    ]

    # Compute per-chapter weighted scores
    ch_scores: dict[int, tuple[float, str]] = {}
    for ch in report.chapters:
        ch_w = compute_weighted_score(ch.scores, weights)
        ch_scores[ch.chapter_index] = (ch_w, grade_from_score(ch_w))

    # Compute average per-criterion across chapters
    criterion_keys = list(weights.keys())
    avg_criteria: dict[str, float] = {}
    for crit in criterion_keys:
        vals = [ch.scores.get(crit, 0) for ch in report.chapters if ch.scores]
        avg_criteria[crit] = round(sum(vals) / len(vals), 1) if vals else 0

    # Auto-increment attempt if not explicitly specified
    attempt = report.attempt
    if attempt == 0 and report.gate:
        if file_exists:
            try:
                with open(csv_path, "r", newline="", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    existing = sum(1 for row in reader if row.get("gate", "") == report.gate)
                attempt = existing + 1
            except Exception:
                attempt = 1
        else:
            attempt = 1

    row = {
        "timestamp": report.timestamp,
        "audiobook_dir": os.path.basename(report.audiobook_dir),
        "gate": report.gate,
        "attempt": attempt,
        "total_score": report.total_score,
        "grade": report.grade,
        "ch1_score": ch_scores.get(1, (0, "F"))[0],
        "ch1_grade": ch_scores.get(1, (0, "F"))[1],
        "ch2_score": ch_scores.get(2, (0, "F"))[0],
        "ch2_grade": ch_scores.get(2, (0, "F"))[1],
    }
    for crit in criterion_keys:
        row[f"avg_{crit}"] = avg_criteria.get(crit, 0)
    row["notes"] = report.notes_text

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)
    print(f"\n📊 Tracking CSV updated: {csv_path}")
    print(f"   Gate={report.gate or '—'} Attempt={attempt} Score={report.total_score} [{report.grade}]")


def save_report(report: EvalReport, output_path: str):
    """Save evaluation report as JSON."""
    report_dict = {
        "audiobook_dir": report.audiobook_dir,
        "template_name": report.template_name,
        "timestamp": report.timestamp,
        "gate": report.gate,
        "attempt": report.attempt,
        "notes": report.notes_text,
        "total_score": report.total_score,
        "max_score": report.max_score,
        "grade": report.grade,
        "criteria_weights": {},
        "summary": report.summary,
        "chapters": [],
    }

    # Load weights for reference
    try:
        with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
            report_dict["criteria_weights"] = json.load(f)["scoring"]["weights"]
    except Exception:
        pass

    for ch in report.chapters:
        ch_dict = {
            "chapter_index": ch.chapter_index,
            "chapter_title": ch.chapter_title,
            "subchunk_count": ch.subchunk_count,
            "scene_segment_count": ch.scene_segment_count,
            "sfx_event_count": ch.sfx_event_count,
            "ambient_voice_duration_ratio": ch.ambient_voice_duration_ratio,
            "sfx_spike_count": ch.sfx_spike_count,
            "scores": ch.scores,
            "notes": ch.notes,
        }
        # Resolution data
        if ch.resolution:
            ch_dict["resolution"] = {
                "ambient_resolved": ch.resolution.ambient_resolved,
                "ambient_count": ch.resolution.ambient_count,
                "ambient_avg_similarity": (
                    round(sum(ch.resolution.ambient_scores) / len(ch.resolution.ambient_scores), 3)
                    if ch.resolution.ambient_scores else 0
                ),
                "sfx_resolved": ch.resolution.sfx_resolved,
                "sfx_count": ch.resolution.sfx_count,
                "sfx_avg_similarity": (
                    round(sum(ch.resolution.sfx_scores) / len(ch.resolution.sfx_scores), 3)
                    if ch.resolution.sfx_scores else 0
                ),
                "ambient_details": ch.resolution.ambient_details,
                "sfx_details": ch.resolution.sfx_details,
            }
        # Audio info
        for key in ["voice_file", "ambient_file", "mixed_file"]:
            ai = getattr(ch, key)
            if ai and ai.exists:
                ch_dict[key] = {
                    "path": ai.path,
                    "duration_sec": ai.duration_sec,
                    "mean_volume_db": ai.mean_volume_db,
                    "lufs": ai.lufs,
                    "codec": ai.codec,
                    "spike_count": len(ai.volume_spikes),
                }
            else:
                ch_dict[key] = None
        report_dict["chapters"].append(ch_dict)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report_dict, f, indent=2, ensure_ascii=False)
    print(f"📄 Report saved: {output_path}")


# ========================================
# CLI Entry Point
# ========================================

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    audiobook_dir = sys.argv[1]
    if not os.path.isabs(audiobook_dir):
        audiobook_dir = os.path.join(os.getcwd(), audiobook_dir)

    gate = ""
    if "--gate" in sys.argv:
        gate_idx = sys.argv.index("--gate")
        if gate_idx + 1 < len(sys.argv):
            gate = sys.argv[gate_idx + 1]

    attempt = 0
    if "--attempt" in sys.argv:
        att_idx = sys.argv.index("--attempt")
        if att_idx + 1 < len(sys.argv):
            try:
                attempt = int(sys.argv[att_idx + 1])
            except ValueError:
                print("⚠ Invalid --attempt value, using auto-increment")

    notes = ""
    if "--notes" in sys.argv:
        notes_idx = sys.argv.index("--notes")
        if notes_idx + 1 < len(sys.argv):
            notes = sys.argv[notes_idx + 1]

    print("🎧 VoiceLibri Soundscape Evaluation Tool v2")
    print(f"   Template: {TEMPLATE_PATH.name}")
    print(f"   Criteria: 7 (ambientOccurrence, sfxOccurrence, ambientSimilarity,")
    print(f"              sfxSimilarity, ambientCoverage, ambientVolume, sfxAudibility)")
    if gate:
        print(f"   Gate: {gate}  Attempt: {attempt or 'auto'}")
    print()

    report = evaluate_audiobook(audiobook_dir)
    report.gate = gate
    report.attempt = attempt
    report.notes_text = notes
    print_summary(report)

    # Save JSON report
    report_path = os.path.join(audiobook_dir, "soundscape_eval_report.json")
    save_report(report, report_path)

    # Append to tracking CSV
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = json.load(f)
    append_to_tracking_csv(report, template["scoring"]["weights"])


if __name__ == "__main__":
    main()
