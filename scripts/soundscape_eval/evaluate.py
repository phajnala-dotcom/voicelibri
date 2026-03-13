"""
VoiceLibri Soundscape Evaluation Tool
======================================

Automated evaluation of soundscape pipeline output quality.
Uses ffprobe/ffmpeg to analyze generated audio, compares against
an ideal template, and produces a detailed scorecard.

Usage:
  python scripts/soundscape_eval/evaluate.py <audiobook_dir> [options]

Options:
  --log <pipeline_log>   Parse pipeline generation log for scene/SFX data
  --gate <gate_id>       Gate identifier (e.g. "0", "1", "2a") for tracking
  --attempt <number>     Attempt number within this gate (default: auto-increment)
  --notes <text>         Free-text annotation for this evaluation run

Examples:
  python scripts/soundscape_eval/evaluate.py audiobooks/The_Shadow_of_Thornwood_Castle
  python scripts/soundscape_eval/evaluate.py audiobooks/The_Shadow_of_Thornwood_Castle --log generation.log
  python scripts/soundscape_eval/evaluate.py audiobooks/soundscape_test_story --gate 0 --attempt 1 --notes "Baseline"

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
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


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
    sample_rate: int = 0
    channels: int = 0
    codec: str = ""
    # Volume envelope analysis
    volume_spikes: list = field(default_factory=list)  # [{time_sec, volume_db}]
    silence_regions: list = field(default_factory=list)  # [{start_sec, end_sec}]


@dataclass
class ChapterEval:
    """Evaluation results for a single chapter."""
    chapter_index: int
    chapter_title: str = ""
    # File presence
    voice_file: Optional[AudioInfo] = None
    ambient_file: Optional[AudioInfo] = None
    intro_file: Optional[AudioInfo] = None
    subchunk_count: int = 0
    # Scene analysis (from log parsing)
    detected_scenes: int = 0
    detected_sfx_planned: int = 0
    detected_sfx_matched: int = 0
    detected_sfx_unmatched: int = 0
    detected_environment: str = ""
    # Audio quality metrics
    ambient_voice_duration_ratio: float = 0.0
    ambient_volume_range_db: float = 0.0
    sfx_spike_count: int = 0
    scene_transition_count: int = 0
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
        # Parse output: lines like "frame:N pts:N pts_time:N.NNN lavfi.astats.Overall.RMS_level=-NN.NN"
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


def detect_scene_transitions(filepath: str) -> int:
    """
    Detect potential ambient scene transitions by looking for brief
    volume dips (crossfade signatures) in the ambient track.
    A crossfade shows as a brief dip followed by recovery.
    """
    try:
        # Use 1-second RMS windows
        result = subprocess.run(
            [
                "ffmpeg", "-i", filepath,
                "-af", "astats=metadata=1:reset=2,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
                "-f", "null", "-",
            ],
            capture_output=True, text=True, timeout=120,
        )
        rms_values = []
        lines = result.stdout.split("\n") if result.stdout else []
        for line in lines:
            time_match = re.search(r"pts_time:([\d.]+)", line)
            rms_match = re.search(r"RMS_level=([-\d.]+)", line)
            if time_match and rms_match:
                rms_values.append((float(time_match.group(1)), float(rms_match.group(1))))

        if len(rms_values) < 4:
            return 0

        transitions = 0
        for i in range(1, len(rms_values) - 1):
            t, rms = rms_values[i]
            prev_rms = rms_values[i - 1][1]
            next_rms = rms_values[i + 1][1]
            # A transition = dip of >3dB followed by recovery within 3dB
            if prev_rms - rms > 3 and next_rms - rms > 2:
                transitions += 1
        return transitions
    except Exception:
        pass
    return 0


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

    # Volume analysis
    info.mean_volume_db, info.max_volume_db = analyze_volume(filepath)

    if detailed:
        # Volume spikes (SFX detection)
        info.volume_spikes = detect_volume_spikes(filepath)
        # Silence regions
        info.silence_regions = detect_silence_regions(filepath)

    return info


# ========================================
# Log Parsing
# ========================================

@dataclass
class LogChapterData:
    """Data extracted from pipeline generation logs."""
    chapter_index: int = 0
    scene_segments: int = 0
    sfx_events_total: int = 0
    sfx_matched: int = 0
    sfx_unmatched: int = 0
    environment: str = ""
    subchunk_count: int = 0
    ambient_resolve_method: str = ""
    ambient_description: str = ""
    sfx_details: list = field(default_factory=list)  # [{description, asset, score}]
    segment_matches: str = ""  # e.g. "3/4 matched"


def parse_pipeline_log(log_path: str) -> dict[int, LogChapterData]:
    """Parse pipeline generation log to extract soundscape decisions."""
    chapters = {}

    if not os.path.exists(log_path):
        return chapters

    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    current_chapter = None

    for line in content.split("\n"):
        # Detect chapter context
        ch_match = re.search(r"chapter\s+(\d+)", line, re.I)

        # Scene analysis results
        env_match = re.search(r'env="([^"]*)".*sfxEvents=(\d+)', line)
        if env_match:
            ch_idx = int(ch_match.group(1)) if ch_match else (current_chapter or 1)
            if ch_idx not in chapters:
                chapters[ch_idx] = LogChapterData(chapter_index=ch_idx)
            chapters[ch_idx].environment = env_match.group(1)
            chapters[ch_idx].sfx_events_total = int(env_match.group(2))
            current_chapter = ch_idx

        # Per-subchunk soundscape line
        subchunk_match = re.search(r"Per-subchunk soundscape:\s*(\d+)\s*subchunks.*?(\d+)\s*scene segment.*?(\d+)\s*SFX events", line)
        if subchunk_match:
            ch_idx = int(ch_match.group(1)) if ch_match else (current_chapter or 1)
            if ch_idx not in chapters:
                chapters[ch_idx] = LogChapterData(chapter_index=ch_idx)
            chapters[ch_idx].subchunk_count = int(subchunk_match.group(1))
            chapters[ch_idx].scene_segments = int(subchunk_match.group(2))
            chapters[ch_idx].sfx_events_total = int(subchunk_match.group(3))
            current_chapter = ch_idx

        # Scene segment resolution
        seg_match = re.search(r"Scene segments resolved:\s*(\d+)/(\d+)\s*matched", line)
        if seg_match:
            ch_idx = current_chapter or 1
            if ch_idx not in chapters:
                chapters[ch_idx] = LogChapterData(chapter_index=ch_idx)
            chapters[ch_idx].segment_matches = f"{seg_match.group(1)}/{seg_match.group(2)}"

        # SFX resolution
        sfx_match = re.search(r'SFX:\s*"([^"]*)".*?→\s*"([^"]*)".*?score=([\d.]+)', line)
        if sfx_match:
            ch_idx = current_chapter or 1
            if ch_idx not in chapters:
                chapters[ch_idx] = LogChapterData(chapter_index=ch_idx)
            chapters[ch_idx].sfx_matched += 1
            chapters[ch_idx].sfx_details.append({
                "description": sfx_match.group(1),
                "asset": sfx_match.group(2),
                "score": float(sfx_match.group(3)),
            })

        sfx_nomatch = re.search(r'SFX:\s*"([^"]*)".*?→\s*no match', line)
        if sfx_nomatch:
            ch_idx = current_chapter or 1
            if ch_idx not in chapters:
                chapters[ch_idx] = LogChapterData(chapter_index=ch_idx)
            chapters[ch_idx].sfx_unmatched += 1
            chapters[ch_idx].sfx_details.append({
                "description": sfx_nomatch.group(1),
                "asset": None,
                "score": 0,
            })

        # Ambient resolution
        amb_match = re.search(r'Ambient: Resolved via\s+(\S+):\s*"([^"]*)"', line)
        if amb_match:
            ch_idx = current_chapter or 1
            if ch_idx not in chapters:
                chapters[ch_idx] = LogChapterData(chapter_index=ch_idx)
            chapters[ch_idx].ambient_resolve_method = amb_match.group(1)
            chapters[ch_idx].ambient_description = amb_match.group(2)

    return chapters


# ========================================
# Scoring Engine
# ========================================

def score_chapter(chapter_eval: ChapterEval, template_chapter: dict, weights: dict) -> dict:
    """Score a single chapter against the ideal template. Returns dict of criterion→score (0-100)."""
    scores = {}

    # 1. Scene Segment Count (0-100)
    ideal = template_chapter["idealSceneSegments"]
    minimum = template_chapter["minSceneSegments"]
    actual = chapter_eval.detected_scenes

    if actual >= ideal:
        scores["sceneSegmentCount"] = 100
    elif actual >= minimum:
        scores["sceneSegmentCount"] = 50 + 50 * (actual - minimum) / max(ideal - minimum, 1)
    elif actual > 0:
        scores["sceneSegmentCount"] = 50 * actual / minimum
    else:
        scores["sceneSegmentCount"] = 0

    # 2. Scene Environment Accuracy (0-100)
    # Check if detected environment matches any expected
    expected_envs = template_chapter["expectedSceneSegments"]
    env_score = 0
    if chapter_eval.detected_environment:
        detected_lower = chapter_eval.detected_environment.lower()
        for exp_seg in expected_envs:
            for acceptable in exp_seg["acceptableEnvironments"]:
                if acceptable.lower() in detected_lower or detected_lower in acceptable.lower():
                    env_score = max(env_score, 100)
                    break
            # Partial: check individual words
            if env_score < 100:
                for word in detected_lower.split():
                    for acceptable in exp_seg["acceptableEnvironments"]:
                        if word in acceptable.lower():
                            env_score = max(env_score, 50)
    scores["sceneEnvironmentAccuracy"] = env_score

    # 3. SFX Event Count (0-100)
    ideal_sfx = template_chapter["idealSfxEvents"]
    min_sfx = template_chapter["minSfxEvents"]
    actual_sfx = chapter_eval.detected_sfx_matched

    if actual_sfx >= ideal_sfx:
        scores["sfxEventCount"] = 100
    elif actual_sfx >= min_sfx:
        scores["sfxEventCount"] = 50 + 50 * (actual_sfx - min_sfx) / max(ideal_sfx - min_sfx, 1)
    elif actual_sfx > 0:
        scores["sfxEventCount"] = 50 * actual_sfx / min_sfx
    else:
        scores["sfxEventCount"] = 0

    # 4. SFX Event Placement (0-100)
    # Based on audio spike detection in ambient track
    if chapter_eval.ambient_file and chapter_eval.ambient_file.exists:
        if chapter_eval.sfx_spike_count >= min_sfx:
            scores["sfxEventPlacement"] = min(100, 50 + 50 * chapter_eval.sfx_spike_count / max(ideal_sfx, 1))
        elif chapter_eval.sfx_spike_count > 0:
            scores["sfxEventPlacement"] = 50 * chapter_eval.sfx_spike_count / max(min_sfx, 1)
        else:
            scores["sfxEventPlacement"] = 0
    else:
        scores["sfxEventPlacement"] = 0

    # 5. Ambient Presence (0-100)
    if chapter_eval.ambient_file and chapter_eval.ambient_file.exists:
        if chapter_eval.ambient_file.duration_sec > 5:
            scores["ambientPresence"] = 100
        elif chapter_eval.ambient_file.duration_sec > 0:
            scores["ambientPresence"] = 50
        else:
            scores["ambientPresence"] = 0
    else:
        scores["ambientPresence"] = 0

    # 6. Ambient Duration Match (0-100)
    if chapter_eval.voice_file and chapter_eval.voice_file.exists and \
       chapter_eval.ambient_file and chapter_eval.ambient_file.exists:
        ratio = chapter_eval.ambient_voice_duration_ratio
        # Perfect = 1.0 (ambient matches voice duration)
        # Good = 0.9-1.1 (within 10%)
        if 0.9 <= ratio <= 1.1:
            scores["ambientDuration"] = 100
        elif 0.7 <= ratio <= 1.3:
            scores["ambientDuration"] = 60
        elif ratio > 0:
            scores["ambientDuration"] = 30
        else:
            scores["ambientDuration"] = 0
    else:
        scores["ambientDuration"] = 0

    # 7. Ambient Volume Range (0-100)
    if chapter_eval.ambient_file and chapter_eval.ambient_file.exists:
        mean = chapter_eval.ambient_file.mean_volume_db
        # Good range: -30 to -10 dB mean (audible but not overwhelming)
        if -30 <= mean <= -10:
            scores["ambientVolumeRange"] = 100
        elif -40 <= mean <= -5:
            scores["ambientVolumeRange"] = 60
        elif mean > -55:
            scores["ambientVolumeRange"] = 30
            chapter_eval.notes.append(f"Ambient too quiet: mean={mean:.1f}dB")
        else:
            scores["ambientVolumeRange"] = 0
            chapter_eval.notes.append(f"Ambient nearly silent: mean={mean:.1f}dB")
    else:
        scores["ambientVolumeRange"] = 0

    # 8. SFX Audibility (0-100)
    if chapter_eval.sfx_spike_count > 0 and chapter_eval.ambient_file and chapter_eval.ambient_file.exists:
        # Are SFX spikes louder than the ambient mean?
        if chapter_eval.ambient_file.volume_spikes:
            avg_spike = sum(s["rms_db"] for s in chapter_eval.ambient_file.volume_spikes) / len(chapter_eval.ambient_file.volume_spikes)
            spike_contrast = avg_spike - chapter_eval.ambient_file.mean_volume_db
            if spike_contrast >= 6:
                scores["sfxAudibility"] = 100
            elif spike_contrast >= 3:
                scores["sfxAudibility"] = 70
            else:
                scores["sfxAudibility"] = 30
                chapter_eval.notes.append(f"SFX not prominent enough: only {spike_contrast:.1f}dB above ambient")
        else:
            scores["sfxAudibility"] = 0
    else:
        scores["sfxAudibility"] = 0
        if chapter_eval.detected_sfx_matched > 0:
            chapter_eval.notes.append("SFX were planned but not audible in output")

    # 9. Scene Transitions (0-100)
    if chapter_eval.detected_scenes > 1:
        expected_transitions = min(chapter_eval.detected_scenes - 1, len(template_chapter["expectedSceneSegments"]) - 1)
        if chapter_eval.scene_transition_count >= expected_transitions:
            scores["sceneTransitions"] = 100
        elif chapter_eval.scene_transition_count > 0:
            scores["sceneTransitions"] = min(100, 100 * chapter_eval.scene_transition_count / max(expected_transitions, 1))
        else:
            scores["sceneTransitions"] = 0
            if expected_transitions > 0:
                chapter_eval.notes.append(f"No scene transitions detected (expected {expected_transitions})")
    else:
        # Single scene — no transitions expected
        scores["sceneTransitions"] = 100 if chapter_eval.detected_scenes == 1 else 0

    # 10. Overall Coverage (0-100)
    # How much of the story's soundscape potential was realized?
    coverage_factors = []
    if scores["ambientPresence"] > 0:
        coverage_factors.append(1.0)
    if scores["sfxEventCount"] > 50:
        coverage_factors.append(1.0)
    elif scores["sfxEventCount"] > 0:
        coverage_factors.append(0.5)
    if scores["sceneSegmentCount"] > 50:
        coverage_factors.append(1.0)
    elif scores["sceneSegmentCount"] > 0:
        coverage_factors.append(0.5)
    if scores["sfxAudibility"] > 50:
        coverage_factors.append(1.0)
    elif scores["sfxAudibility"] > 0:
        coverage_factors.append(0.5)

    if coverage_factors:
        scores["overallCoverage"] = round(100 * sum(coverage_factors) / 4)
    else:
        scores["overallCoverage"] = 0

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
# Main Evaluation Logic
# ========================================

def discover_chapter_files(audiobook_dir: str) -> dict[int, dict]:
    """
    Discover chapter voice and ambient files in an audiobook directory.
    Supports two naming conventions:
      Legacy:  chapter_N.ogg, chapter_N_ambient.ogg, chapter_N_intro.ogg
      Current: NN_N Title.ogg, NN_N Title_ambient.ogg, NN_N Title_intro.ogg
    Returns {chapter_index: {voice, ambient, intro, mixed, subchunks}}
    """
    chapters = {}

    # Collect all OGG files in the directory
    all_oggs = sorted(glob.glob(os.path.join(audiobook_dir, "*.ogg")))

    for f in all_oggs:
        basename = os.path.basename(f)
        name_no_ext = os.path.splitext(basename)[0]

        # Skip suffixed variants (ambient, intro, mixed)
        if name_no_ext.endswith("_ambient") or name_no_ext.endswith("_intro") or name_no_ext.endswith("_mixed"):
            continue

        # Try legacy pattern: chapter_N.ogg
        ch_match = re.match(r"chapter_(\d+)$", name_no_ext)
        if ch_match:
            ch_idx = int(ch_match.group(1))
        else:
            # Try current pattern: NN_N Title.ogg (e.g., "01_1 The Forest Path")
            new_match = re.match(r"\d+_(\d+)\s", name_no_ext)
            if new_match:
                ch_idx = int(new_match.group(1))
            else:
                continue  # Unknown pattern, skip

        if ch_idx not in chapters:
            chapters[ch_idx] = {"voice": None, "ambient": None, "intro": None, "mixed": None, "subchunks": []}
        chapters[ch_idx]["voice"] = f

        # Look for related files using the same base name
        for suffix, key in [("_ambient", "ambient"), ("_intro", "intro"), ("_mixed", "mixed")]:
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
            if name_no_ext.endswith("_ambient") or name_no_ext.endswith("_intro") or name_no_ext.endswith("_mixed"):
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
                chapters[ch_idx] = {"voice": f, "ambient": None, "intro": None, "mixed": None, "subchunks": []}
            dir_path = os.path.dirname(f)
            for suffix, key in [("_ambient", "ambient"), ("_intro", "intro"), ("_mixed", "mixed")]:
                related = os.path.join(dir_path, f"{name_no_ext}{suffix}.ogg")
                if os.path.exists(related):
                    chapters[ch_idx][key] = related

    return chapters


def evaluate_audiobook(audiobook_dir: str, log_path: Optional[str] = None) -> EvalReport:
    """Run full evaluation of a generated audiobook against the ideal template."""

    # Load template
    if not TEMPLATE_PATH.exists():
        print(f"❌ Template not found: {TEMPLATE_PATH}")
        sys.exit(1)

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = json.load(f)

    weights = template["scoring"]["weights"]

    report = EvalReport(
        audiobook_dir=audiobook_dir,
        template_name=template.get("title", "unknown"),
    )

    from datetime import datetime
    report.timestamp = datetime.now().isoformat()

    # Parse pipeline log if provided
    log_data: dict[int, LogChapterData] = {}
    if log_path:
        print(f"📋 Parsing pipeline log: {log_path}")
        log_data = parse_pipeline_log(log_path)
        for ch_idx, data in log_data.items():
            print(f"  Chapter {ch_idx}: {data.scene_segments} scenes, "
                  f"{data.sfx_matched} SFX matched, {data.sfx_unmatched} unmatched, "
                  f'env="{data.environment}"')

    # Discover files
    print(f"\n📁 Scanning: {audiobook_dir}")
    chapter_files = discover_chapter_files(audiobook_dir)

    if not chapter_files:
        print("❌ No chapter files found! Generate the audiobook first.")
        print(f"   Expected files like: chapter_1.ogg, chapter_1_ambient.ogg in {audiobook_dir}")
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

        # Analyze voice file
        if files["voice"]:
            print(f"  🎤 Voice: {os.path.basename(files['voice'])}")
            chapter_eval.voice_file = analyze_audio_file(files["voice"], detailed=False)
            print(f"     Duration: {chapter_eval.voice_file.duration_sec:.1f}s, "
                  f"Volume: mean={chapter_eval.voice_file.mean_volume_db:.1f}dB")
        else:
            print(f"  🎤 Voice: NOT FOUND")
            chapter_eval.notes.append("Voice file missing")

        # Analyze ambient file
        if files["ambient"]:
            print(f"  🌿 Ambient: {os.path.basename(files['ambient'])}")
            chapter_eval.ambient_file = analyze_audio_file(files["ambient"], detailed=True)
            print(f"     Duration: {chapter_eval.ambient_file.duration_sec:.1f}s, "
                  f"Volume: mean={chapter_eval.ambient_file.mean_volume_db:.1f}dB, "
                  f"max={chapter_eval.ambient_file.max_volume_db:.1f}dB")
            print(f"     Volume spikes (potential SFX): {len(chapter_eval.ambient_file.volume_spikes)}")
            chapter_eval.sfx_spike_count = len(chapter_eval.ambient_file.volume_spikes)
            if chapter_eval.ambient_file.volume_spikes:
                for spike in chapter_eval.ambient_file.volume_spikes[:8]:
                    print(f"       @ {spike['time_sec']:.1f}s: {spike['rms_db']:.1f}dB")
                if len(chapter_eval.ambient_file.volume_spikes) > 8:
                    print(f"       ... and {len(chapter_eval.ambient_file.volume_spikes) - 8} more")

            # Scene transition detection
            chapter_eval.scene_transition_count = detect_scene_transitions(files["ambient"])
            print(f"     Scene transitions detected: {chapter_eval.scene_transition_count}")
        else:
            print(f"  🌿 Ambient: NOT FOUND")
            chapter_eval.notes.append("Ambient file missing — soundscape not generated")

        # Analyze intro file
        if files["intro"]:
            print(f"  🎵 Intro: {os.path.basename(files['intro'])}")
            chapter_eval.intro_file = analyze_audio_file(files["intro"], detailed=False)
            print(f"     Duration: {chapter_eval.intro_file.duration_sec:.1f}s")

        # Subchunk count
        chapter_eval.subchunk_count = len(files.get("subchunks", []))
        if chapter_eval.subchunk_count:
            print(f"  📦 Subchunks: {chapter_eval.subchunk_count}")

        # Duration ratio
        if chapter_eval.voice_file and chapter_eval.voice_file.exists and \
           chapter_eval.ambient_file and chapter_eval.ambient_file.exists and \
           chapter_eval.voice_file.duration_sec > 0:
            chapter_eval.ambient_voice_duration_ratio = (
                chapter_eval.ambient_file.duration_sec / chapter_eval.voice_file.duration_sec
            )
            print(f"  📏 Duration ratio (ambient/voice): {chapter_eval.ambient_voice_duration_ratio:.2f}")

        # Merge log data
        if ch_idx in log_data:
            ld = log_data[ch_idx]
            chapter_eval.detected_scenes = ld.scene_segments
            chapter_eval.detected_sfx_planned = ld.sfx_events_total
            chapter_eval.detected_sfx_matched = ld.sfx_matched
            chapter_eval.detected_sfx_unmatched = ld.sfx_unmatched
            chapter_eval.detected_environment = ld.environment
            print(f"  📊 From log: {ld.scene_segments} scenes, "
                  f"{ld.sfx_matched}/{ld.sfx_events_total} SFX matched, "
                  f'env="{ld.environment}", segments={ld.segment_matches}')
            if ld.sfx_details:
                print(f"  🎯 SFX Details:")
                for sfx in ld.sfx_details:
                    if sfx["asset"]:
                        print(f"     ✓ \"{sfx['description'][:45]}\" → \"{sfx['asset'][:40]}\" (score={sfx['score']:.3f})")
                    else:
                        print(f"     ✗ \"{sfx['description'][:45]}\" → no match")
        else:
            # Without log data, estimate from audio analysis
            if chapter_eval.ambient_file and chapter_eval.ambient_file.exists:
                # Estimate scene count from transitions + 1
                chapter_eval.detected_scenes = max(1, chapter_eval.scene_transition_count + 1)
                # Estimate SFX from spikes
                chapter_eval.detected_sfx_matched = chapter_eval.sfx_spike_count
                chapter_eval.notes.append("No pipeline log — scores estimated from audio analysis only")

        # Score this chapter
        chapter_eval.scores = score_chapter(chapter_eval, template_chapter, weights)
        chapter_weighted = compute_weighted_score(chapter_eval.scores, weights)

        print(f"\n  📊 SCORES:")
        for criterion, score_val in chapter_eval.scores.items():
            bar = "█" * int(score_val / 5) + "░" * (20 - int(score_val / 5))
            print(f"     {criterion:30s} {bar} {score_val:5.1f}/100")
        print(f"     {'─'*58}")
        print(f"     {'WEIGHTED CHAPTER SCORE':30s} {'':20s} {chapter_weighted:5.1f}/100")

        if chapter_eval.notes:
            print(f"\n  📝 Notes:")
            for note in chapter_eval.notes:
                print(f"     • {note}")

        report.chapters.append(chapter_eval)

    # Overall score = average of chapter scores
    if report.chapters:
        chapter_scores = []
        for ch in report.chapters:
            chapter_scores.append(compute_weighted_score(ch.scores, weights))
        report.total_score = round(sum(chapter_scores) / len(chapter_scores), 1)
    else:
        report.total_score = 0

    report.grade = grade_from_score(report.total_score)

    return report


def print_summary(report: EvalReport):
    """Print the final summary."""
    print(f"\n{'='*60}")
    print(f"📊 SOUNDSCAPE EVALUATION SUMMARY")
    print(f"{'='*60}")
    print(f"  Audiobook:  {report.audiobook_dir}")
    print(f"  Template:   {report.template_name}")
    print(f"  Chapters:   {len(report.chapters)}")
    print(f"  Timestamp:  {report.timestamp}")
    print()

    if report.chapters:
        for ch in report.chapters:
            ch_score = compute_weighted_score(ch.scores, json.load(open(TEMPLATE_PATH))["scoring"]["weights"])
            grade = grade_from_score(ch_score)
            print(f"  Chapter {ch.chapter_index} ({ch.chapter_title}): {ch_score:.1f}/100 [{grade}]")
            # Key findings
            if ch.ambient_file and ch.ambient_file.exists:
                print(f"    ✓ Ambient: {ch.ambient_file.duration_sec:.1f}s, vol={ch.ambient_file.mean_volume_db:.1f}dB")
            else:
                print(f"    ✗ Ambient: MISSING")
            print(f"    Scenes: {ch.detected_scenes}, SFX matched: {ch.detected_sfx_matched}, "
                  f"Spikes: {ch.sfx_spike_count}, Transitions: {ch.scene_transition_count}")
    else:
        print("  No chapters evaluated.")

    bar_full = "█" * int(report.total_score / 5)
    bar_empty = "░" * (20 - int(report.total_score / 5))
    print(f"\n  TOTAL SCORE: {bar_full}{bar_empty} {report.total_score:.1f}/100  Grade: {report.grade}")
    print()

    # Diagnosis
    if report.total_score == 0:
        print("  💡 Score is 0 — the audiobook hasn't been generated yet.")
        print("     Generate it first, then re-run this evaluation.")
    elif report.total_score < 40:
        print("  💡 Score is very low. Key issues:")
        for ch in report.chapters:
            if ch.scores.get("ambientPresence", 0) == 0:
                print(f"     • Ch{ch.chapter_index}: No ambient track generated")
            if ch.scores.get("sfxEventCount", 0) == 0:
                print(f"     • Ch{ch.chapter_index}: No SFX events resolved")
            if ch.scores.get("ambientVolumeRange", 0) < 30:
                print(f"     • Ch{ch.chapter_index}: Ambient volume too quiet")
    elif report.total_score < 70:
        print("  💡 Moderate score. Look for:")
        for ch in report.chapters:
            low_scores = {k: v for k, v in ch.scores.items() if v < 50}
            if low_scores:
                print(f"     • Ch{ch.chapter_index} weak areas: {', '.join(low_scores.keys())}")


def append_to_tracking_csv(report: EvalReport, weights: dict):
    """Append evaluation results as a new row to the cumulative tracking CSV."""
    csv_path = TRACKING_CSV_PATH
    file_exists = csv_path.exists()

    columns = [
        "timestamp", "audiobook_dir", "gate", "attempt",
        "total_score", "grade",
        "ch1_score", "ch1_grade", "ch2_score", "ch2_grade",
        "avg_sceneSegmentCount", "avg_sceneEnvAccuracy",
        "avg_sfxEventCount", "avg_sfxEventPlacement",
        "avg_ambientPresence", "avg_ambientDuration",
        "avg_ambientVolumeRange", "avg_sfxAudibility",
        "avg_sceneTransitions", "avg_overallCoverage",
        "notes",
    ]

    # Compute per-chapter weighted scores
    ch_scores: dict[int, tuple[float, str]] = {}
    for ch in report.chapters:
        ch_w = compute_weighted_score(ch.scores, weights)
        ch_scores[ch.chapter_index] = (ch_w, grade_from_score(ch_w))

    # Compute average per-criterion across chapters
    criterion_keys = [
        "sceneSegmentCount", "sceneEnvironmentAccuracy",
        "sfxEventCount", "sfxEventPlacement",
        "ambientPresence", "ambientDuration",
        "ambientVolumeRange", "sfxAudibility",
        "sceneTransitions", "overallCoverage",
    ]
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
        "avg_sceneSegmentCount": avg_criteria.get("sceneSegmentCount", 0),
        "avg_sceneEnvAccuracy": avg_criteria.get("sceneEnvironmentAccuracy", 0),
        "avg_sfxEventCount": avg_criteria.get("sfxEventCount", 0),
        "avg_sfxEventPlacement": avg_criteria.get("sfxEventPlacement", 0),
        "avg_ambientPresence": avg_criteria.get("ambientPresence", 0),
        "avg_ambientDuration": avg_criteria.get("ambientDuration", 0),
        "avg_ambientVolumeRange": avg_criteria.get("ambientVolumeRange", 0),
        "avg_sfxAudibility": avg_criteria.get("sfxAudibility", 0),
        "avg_sceneTransitions": avg_criteria.get("sceneTransitions", 0),
        "avg_overallCoverage": avg_criteria.get("overallCoverage", 0),
        "notes": report.notes_text,
    }

    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)
    print(f"\n📊 Tracking CSV updated: {csv_path}")
    print(f"   Gate={report.gate or '—'} Attempt={attempt} Score={report.total_score} [{report.grade}]")


def save_report(report: EvalReport, output_path: str):
    """Save evaluation report as JSON."""
    # Convert dataclasses to dicts for JSON serialization
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
        "summary": report.summary,
        "chapters": [],
    }

    for ch in report.chapters:
        ch_dict = {
            "chapter_index": ch.chapter_index,
            "chapter_title": ch.chapter_title,
            "subchunk_count": ch.subchunk_count,
            "detected_scenes": ch.detected_scenes,
            "detected_sfx_planned": ch.detected_sfx_planned,
            "detected_sfx_matched": ch.detected_sfx_matched,
            "detected_sfx_unmatched": ch.detected_sfx_unmatched,
            "detected_environment": ch.detected_environment,
            "ambient_voice_duration_ratio": ch.ambient_voice_duration_ratio,
            "sfx_spike_count": ch.sfx_spike_count,
            "scene_transition_count": ch.scene_transition_count,
            "scores": ch.scores,
            "notes": ch.notes,
        }
        # Audio info
        for key in ["voice_file", "ambient_file", "intro_file"]:
            ai = getattr(ch, key)
            if ai and ai.exists:
                ch_dict[key] = {
                    "path": ai.path,
                    "duration_sec": ai.duration_sec,
                    "mean_volume_db": ai.mean_volume_db,
                    "max_volume_db": ai.max_volume_db,
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
        print("\nQuick start:")
        print("  1. Generate the test audiobook:")
        print("     - Start backend: npm run dev:backend")
        print("     - Select book: curl -X POST http://localhost:3001/api/book/select \\")
        print('       -H "Content-Type: application/json" \\')
        print('       -d \'{"filename":"soundscape_test_story.txt","targetLanguage":"en"}\'')
        print("     - Generate: curl -X POST http://localhost:3001/api/audiobooks/generate \\")
        print('       -H "Content-Type: application/json" \\')
        print('       -d \'{"title":"The_Shadow_of_Thornwood_Castle"}\'')
        print("  2. Run evaluation:")
        print("     python scripts/soundscape_eval/evaluate.py audiobooks/The_Shadow_of_Thornwood_Castle")
        print("\n  Optional: capture pipeline log during generation:")
        print("     npm run dev:backend 2>&1 | tee generation.log")
        print("     python scripts/soundscape_eval/evaluate.py audiobooks/The_Shadow_of_Thornwood_Castle --log generation.log")
        sys.exit(0)

    audiobook_dir = sys.argv[1]
    # Make path absolute if relative
    if not os.path.isabs(audiobook_dir):
        audiobook_dir = os.path.join(os.getcwd(), audiobook_dir)

    log_path = None
    if "--log" in sys.argv:
        log_idx = sys.argv.index("--log")
        if log_idx + 1 < len(sys.argv):
            log_path = sys.argv[log_idx + 1]
            if not os.path.isabs(log_path):
                log_path = os.path.join(os.getcwd(), log_path)

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

    print("🎧 VoiceLibri Soundscape Evaluation Tool")
    print(f"   Template: {TEMPLATE_PATH.name}")
    if gate:
        print(f"   Gate: {gate}  Attempt: {attempt or 'auto'}")
    print()

    report = evaluate_audiobook(audiobook_dir, log_path)
    report.gate = gate
    report.attempt = attempt
    report.notes_text = notes
    print_summary(report)

    # Save JSON report to audiobook folder
    report_path = os.path.join(audiobook_dir, "soundscape_eval_report.json")
    save_report(report, report_path)

    # Append to cumulative tracking CSV
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = json.load(f)
    append_to_tracking_csv(report, template["scoring"]["weights"])


if __name__ == "__main__":
    main()
