#!/usr/bin/env python3
"""
Main entry point for the ICU discharge annotation pipeline.

Usage:
    # Run all three models on all visits
    python run.py

    # Run only anthropic + openai on the first 5 visits
    python run.py --models anthropic openai --max-visits 5

    # Use a different data file
    python run.py --data /path/to/other.json
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

import config
import data_loader
from annotator import run_annotations
from llm_clients import AnthropicAnnotator, OpenAIAnnotator, GeminiAnnotator

ANNOTATOR_MAP = {
    "anthropic": AnthropicAnnotator,
    "openai": OpenAIAnnotator,
    "gemini": GeminiAnnotator,
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run LLM annotators on MIMIC-IV ICU visits"
    )
    parser.add_argument(
        "--data",
        type=str,
        default=str(config.DATA_PATH),
        help="Path to the visits JSON file",
    )
    parser.add_argument(
        "--models",
        nargs="+",
        choices=list(ANNOTATOR_MAP.keys()),
        default=list(ANNOTATOR_MAP.keys()),
        help="Which models to run (default: all three)",
    )
    parser.add_argument(
        "--max-visits",
        type=int,
        default=None,
        help="Limit to the first N visits (useful for testing)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Override results directory",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
    )
    args = parser.parse_args()

    # Logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    )

    # Load .env
    load_dotenv(config.PROJECT_DIR / ".env")

    # Override output dir if specified
    if args.output_dir:
        config.RESULTS_DIR = Path(args.output_dir)
        config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # Load data
    visits = data_loader.load_visits(args.data)
    if args.max_visits:
        visits = visits[: args.max_visits]
    logging.info("Loaded %d visits from %s", len(visits), args.data)

    # Init annotators
    annotators = []
    for name in args.models:
        try:
            annotators.append(ANNOTATOR_MAP[name]())
            logging.info("Initialised %s annotator", name)
        except RuntimeError as exc:
            logging.error("Skipping %s: %s", name, exc)

    if not annotators:
        logging.error("No annotators could be initialised. Check your API keys.")
        sys.exit(1)

    # Run
    summary = run_annotations(visits, annotators)

    # Report
    print("\n══════════════════════════════════════════════════════════════")
    print("  ANNOTATION RUN COMPLETE")
    print("══════════════════════════════════════════════════════════════")
    for prov, stats in summary.get("models", {}).items():
        print(f"\n  {prov}:")
        print(f"    Calls : {stats['total_calls']}")
        print(f"    Errors: {stats['total_errors']}")
        print(f"    Tokens: {stats['total_input_tokens']:,} in / {stats['total_output_tokens']:,} out")
    print(f"\n  Results saved to: {config.RESULTS_DIR}")
    print("══════════════════════════════════════════════════════════════\n")


if __name__ == "__main__":
    main()
