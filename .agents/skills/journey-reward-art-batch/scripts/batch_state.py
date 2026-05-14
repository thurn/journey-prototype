#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from collections import Counter
from pathlib import Path

ROOT = Path.cwd()
ART_DIR = Path("/Users/dthurn/Documents/shutterstock/images_journeys")
ART_JSON = Path("/Users/dthurn/Documents/shutterstock/journey_urls.json")
REWARDS_MD = ROOT / "docs/rewards.md"
OUTPUT_TOML = ROOT / "docs/journey-reward-art-matches.toml"
STATE_DIR = Path("/tmp/journey-reward-art-batch")
RESULTS_DIR = STATE_DIR / "results"
INFLIGHT_FILE = STATE_DIR / "inflight.txt"

IMAGE_ID_RE = re.compile(r"(\d+)(?=\.[A-Za-z0-9]+$)")
REWARD_RE = re.compile(r"^- \[(?P<pct>[0-9.]+)%\] (?P<reward>.+)$")
WORD_RE = re.compile(r"[A-Za-z0-9]+")
STOPWORDS = {"a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with"}


def numeric_key(value: str) -> tuple[int, str]:
    return (int(value), value) if value.isdigit() else (10**20, value)


def ensure_state() -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    INFLIGHT_FILE.touch(exist_ok=True)


def load_image_ids() -> list[str]:
    ids: set[str] = set()
    if ART_JSON.exists():
        data = json.loads(ART_JSON.read_text())
        for item in data:
            image_id = str(item.get("id", "")).strip()
            if image_id:
                ids.add(image_id)
    if ART_DIR.exists():
        for path in ART_DIR.iterdir():
            if path.is_file():
                match = IMAGE_ID_RE.search(path.name)
                if match:
                    ids.add(match.group(1))
    return sorted(ids, key=numeric_key)


def load_rewards() -> list[dict[str, object]]:
    rewards: list[dict[str, object]] = []
    for line in REWARDS_MD.read_text().splitlines():
        match = REWARD_RE.match(line)
        if not match:
            continue
        percentage = float(match.group("pct"))
        rewards.append(
            {
                "reward_type": match.group("reward").strip(),
                "percentage": percentage,
                "post_transition_cap": 5 + (2 if percentage > 2 else 0),
            }
        )
    return rewards


def parse_toml(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("rb") as handle:
        data = tomllib.load(handle)
    dreams = data.get("dreams", [])
    if not isinstance(dreams, list):
        raise ValueError(f"{path}: expected [[dreams]] array")
    parsed: list[dict[str, str]] = []
    for dream in dreams:
        if not isinstance(dream, dict):
            raise ValueError(f"{path}: each [[dreams]] entry must be a table")
        parsed.append({str(key): str(value) for key, value in dream.items()})
    return parsed


def result_files() -> list[Path]:
    if not RESULTS_DIR.exists():
        return []
    return sorted(RESULTS_DIR.glob("*.toml"), key=lambda path: numeric_key(path.stem))


def load_assignments(include_results: bool = True) -> list[dict[str, str]]:
    assignments: list[dict[str, str]] = []
    for dream in parse_toml(OUTPUT_TOML):
        dream["_source"] = str(OUTPUT_TOML)
        assignments.append(dream)
    if include_results:
        for path in result_files():
            for dream in parse_toml(path):
                dream["_source"] = str(path)
                assignments.append(dream)
    return assignments


def reward_counts(assignments: list[dict[str, str]]) -> Counter[str]:
    return Counter(dream.get("reward_type", "") for dream in assignments if dream.get("reward_type"))


def transition_active(counts: Counter[str], rewards: list[dict[str, object]]) -> bool:
    return bool(rewards) and all(counts[str(reward["reward_type"])] >= 2 for reward in rewards)


def cap_for(reward: dict[str, object], transition: bool) -> int:
    return int(reward["post_transition_cap"]) if transition else 3


def validate_assignments(assignments: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    rewards = load_rewards()
    known_rewards = {str(reward["reward_type"]) for reward in rewards}
    known_images = set(load_image_ids())
    seen_images: dict[str, str] = {}

    for index, dream in enumerate(assignments, start=1):
        source = dream.get("_source", "unknown source")
        image_id = dream.get("image_id", "")
        dream_name = dream.get("dream_name", "")
        reward_type = dream.get("reward_type", "")

        if set(dream) - {"image_id", "dream_name", "reward_type", "_source"}:
            errors.append(f"{source}: dream {index} has extra fields")
        if not image_id:
            errors.append(f"{source}: dream {index} missing image_id")
        elif image_id not in known_images:
            errors.append(f"{source}: unknown image_id {image_id}")
        elif image_id in seen_images:
            errors.append(f"{source}: duplicate image_id {image_id}; first seen in {seen_images[image_id]}")
        else:
            seen_images[image_id] = source
        if len(dream_name.split()) != 2:
            errors.append(f"{source}: {image_id} dream_name must be exactly two words")
        if reward_type not in known_rewards:
            errors.append(f"{source}: {image_id} reward_type is not in docs/rewards.md")

    counts = reward_counts(assignments)
    transition = transition_active(counts, rewards)
    for reward in rewards:
        reward_type = str(reward["reward_type"])
        count = counts[reward_type]
        cap = cap_for(reward, transition)
        if count > cap:
            errors.append(f"reward over cap: {reward_type} has {count}/{cap} assignments")

    words = name_words(assignments)
    for word, count in sorted(words.items()):
        if count > 3:
            errors.append(f"name word over cap: {word} has {count}/3 uses")

    return errors


def validate_result_file_shape(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"{path}: result file does not exist"]
    dreams = parse_toml(path)
    if len(dreams) != 1:
        errors.append(f"{path}: expected exactly one [[dreams]] entry")
        return errors
    image_id = dreams[0].get("image_id", "")
    if image_id != path.stem:
        errors.append(f"{path}: image_id {image_id} does not match filename stem {path.stem}")
    return errors


def read_inflight() -> set[str]:
    ensure_state()
    return {line.strip() for line in INFLIGHT_FILE.read_text().splitlines() if line.strip()}


def write_inflight(ids: set[str]) -> None:
    ensure_state()
    INFLIGHT_FILE.write_text("".join(f"{image_id}\n" for image_id in sorted(ids, key=numeric_key)))


def command_init(_: argparse.Namespace) -> int:
    ensure_state()
    print(f"images={len(load_image_ids())}")
    print(f"rewards={len(load_rewards())}")
    print(f"results_dir={RESULTS_DIR}")
    print(f"output={OUTPUT_TOML}")
    return 0


def command_reset_inflight(_: argparse.Namespace) -> int:
    ensure_state()
    INFLIGHT_FILE.write_text("")
    print("inflight=0")
    return 0


def command_next(args: argparse.Namespace) -> int:
    ensure_state()
    assigned = {dream["image_id"] for dream in load_assignments() if dream.get("image_id")}
    inflight = read_inflight()
    candidates = [image_id for image_id in load_image_ids() if image_id not in assigned and image_id not in inflight]
    if not candidates:
        print("WAITING" if inflight else "DONE")
        return 0
    selected = candidates[: args.count]
    write_inflight(inflight | set(selected))
    print("\n".join(selected))
    return 0


def command_release(args: argparse.Namespace) -> int:
    inflight = read_inflight()
    inflight.discard(args.image_id)
    write_inflight(inflight)
    print(f"released={args.image_id}")
    return 0


def command_status(_: argparse.Namespace) -> int:
    rewards = load_rewards()
    assignments = load_assignments()
    counts = reward_counts(assignments)
    transition = transition_active(counts, rewards)
    print(f"assignments={len(assignments)}")
    print(f"transition={'post' if transition else 'pre'}")
    print("coverage=min_2" if transition else "coverage=needs_2_each")
    for reward in rewards:
        reward_type = str(reward["reward_type"])
        count = counts[reward_type]
        cap = cap_for(reward, transition)
        print(f"{count}/{cap} | {reward_type}")
    return 0


def command_blocked(_: argparse.Namespace) -> int:
    rewards = load_rewards()
    counts = reward_counts(load_assignments())
    transition = transition_active(counts, rewards)
    blocked = [
        str(reward["reward_type"])
        for reward in rewards
        if counts[str(reward["reward_type"])] >= cap_for(reward, transition)
    ]
    print("\n".join(blocked) if blocked else "NONE")
    return 0


def command_check_reward(args: argparse.Namespace) -> int:
    rewards = load_rewards()
    reward_by_type = {str(reward["reward_type"]): reward for reward in rewards}
    reward = reward_by_type.get(args.reward_type)
    if reward is None:
        print("FAIL unknown reward")
        return 1
    counts = reward_counts(load_assignments())
    transition = transition_active(counts, rewards)
    count = counts[args.reward_type]
    cap = cap_for(reward, transition)
    if count >= cap:
        print(f"FAIL {count}/{cap}")
        return 1
    print(f"PASS {count}/{cap}")
    return 0


def name_words(assignments: list[dict[str, str]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for dream in assignments:
        for word in WORD_RE.findall(dream.get("dream_name", "").lower()):
            if word not in STOPWORDS:
                counts[word] += 1
    return counts


def command_check_name(args: argparse.Namespace) -> int:
    words = [word for word in WORD_RE.findall(args.dream_name.lower()) if word not in STOPWORDS]
    if len(args.dream_name.split()) != 2:
        print("FAIL name must be exactly two words")
        return 1
    counts = name_words(load_assignments())
    repeated = [(word, counts[word]) for word in words if counts[word] >= 3]
    warned = [(word, counts[word]) for word in words if counts[word] == 2]
    if repeated:
        print("FAIL " + ", ".join(f"{word}={count}" for word, count in repeated))
        return 1
    if warned:
        print("WARN " + ", ".join(f"{word}={count}" for word, count in warned))
        return 0
    print("PASS")
    return 0


def command_word_report(_: argparse.Namespace) -> int:
    counts = name_words(load_assignments())
    for word, count in counts.most_common():
        if count >= 2:
            print(f"{count} | {word}")
    return 0


def command_validate(args: argparse.Namespace) -> int:
    path = Path(args.path)
    errors = validate_result_file_shape(path)
    assignments = load_assignments(include_results=False)
    for result_path in result_files():
        if result_path.resolve() != path.resolve():
            for dream in parse_toml(result_path):
                dream["_source"] = str(result_path)
                assignments.append(dream)
    for dream in parse_toml(path):
        dream["_source"] = str(path)
        assignments.append(dream)
    errors.extend(validate_assignments(assignments))
    if errors:
        print("FAIL")
        print("\n".join(errors))
        return 1
    print("PASS")
    return 0


def quote_toml(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def render_toml(assignments: list[dict[str, str]]) -> str:
    lines: list[str] = []
    for dream in sorted(assignments, key=lambda item: numeric_key(item["image_id"])):
        if lines:
            lines.append("")
        lines.append("[[dreams]]")
        lines.append(f"image_id = {quote_toml(dream['image_id'])}")
        lines.append(f"dream_name = {quote_toml(dream['dream_name'])}")
        lines.append(f"reward_type = {quote_toml(dream['reward_type'])}")
    return "\n".join(lines) + ("\n" if lines else "")


def command_join(_: argparse.Namespace) -> int:
    assignments = load_assignments()
    errors = validate_assignments(assignments)
    if errors:
        print("FAIL")
        print("\n".join(errors))
        return 1
    OUTPUT_TOML.write_text(render_toml(assignments))
    for path in result_files():
        path.unlink()
    write_inflight(set())
    print(f"joined={len(assignments)}")
    print(f"output={OUTPUT_TOML}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage Journey reward art batch matching state.")
    subparsers = parser.add_subparsers(required=True)

    init = subparsers.add_parser("init")
    init.set_defaults(func=command_init)

    reset = subparsers.add_parser("reset-inflight")
    reset.set_defaults(func=command_reset_inflight)

    next_parser = subparsers.add_parser("next")
    next_parser.add_argument("count", type=int)
    next_parser.set_defaults(func=command_next)

    release = subparsers.add_parser("release")
    release.add_argument("image_id")
    release.set_defaults(func=command_release)

    status = subparsers.add_parser("status")
    status.set_defaults(func=command_status)

    blocked = subparsers.add_parser("blocked-rewards")
    blocked.set_defaults(func=command_blocked)

    check_reward = subparsers.add_parser("check-reward")
    check_reward.add_argument("reward_type")
    check_reward.set_defaults(func=command_check_reward)

    check_name = subparsers.add_parser("check-name")
    check_name.add_argument("dream_name")
    check_name.set_defaults(func=command_check_name)

    word_report = subparsers.add_parser("word-report")
    word_report.set_defaults(func=command_word_report)

    validate = subparsers.add_parser("validate-result")
    validate.add_argument("path")
    validate.set_defaults(func=command_validate)

    join = subparsers.add_parser("join")
    join.set_defaults(func=command_join)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
