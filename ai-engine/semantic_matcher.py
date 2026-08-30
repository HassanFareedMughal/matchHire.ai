"""
semantic_matcher.py — matchHire.ai FYP-II Phase 1
====================================================

Sentence-BERT Semantic Matching Component

This module provides transformer-based semantic similarity scoring between
a resume and one or more job descriptions. It is a **standalone component**
that runs independently of the existing TF-IDF pipeline in matcher.py.

Purpose (FYP-II Phase 1):
    - Verify that sentence-transformers embedding + cosine similarity works
      correctly in our local Python environment (CPU, Windows, no GPU).
    - Establish the semantic-matching foundation for later integration into
      the existing Node.js-to-Python hybrid scoring pipeline.

Model: sentence-transformers/all-MiniLM-L6-v2
    - ~22.7M parameters, ~90 MB on disk.
    - Produces 384-dimensional dense embeddings.
    - Optimised for CPU inference; handles 50-200+ sentences/sec.
    - No GPU required; standard pip install works on Windows.
    - Licensed MIT; suitable for academic / FYP use.

The model is downloaded automatically from HuggingFace Hub on the first
run and cached in ~/.cache/torch/sentence_transformers (or the directory
specified by the SENTENCE_TRANSFORMERS_HOME environment variable).
Subsequent runs load from cache without any network access.

NOTE: This module does NOT modify, import from, or replace:
    - matcher.py          (TF-IDF baseline — FYP-I)
    - Any backend routes  (Node.js)
    - MongoDB / Redis     (caching layer)
    - Frontend code

Integration into the full pipeline is deferred to FYP-II Phase 2.
"""

import time
import logging
from typing import Optional, Union
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine

# ---------------------------------------------------------------------------
# Module-level logger (non-intrusive; does not pollute stdout)
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("[semantic_matcher] %(levelname)s: %(message)s"))
    logger.addHandler(_handler)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MODEL_NAME = "all-MiniLM-L6-v2"
# Maximum character length fed into the encoder. Prevents edge cases where
# an extremely long resume causes slow inference. The model's internal
# tokenizer already truncates to 256 word-pieces, but we pre-truncate text
# to keep memory predictable.
MAX_TEXT_CHARS = 10_000


# ---------------------------------------------------------------------------
# SemanticMatcher class
# ---------------------------------------------------------------------------

class SemanticMatcher:
    """
    Loads a Sentence-BERT model and computes cosine similarity between
    a resume embedding and one or more job-description embeddings.

    Usage (standalone test / Phase 1):
        matcher = SemanticMatcher()
        score = matcher.score_single(resume_text, jd_text)

    Usage (batch — Phase 2 integration):
        results = matcher.score_batch(resume_text, list_of_jd_texts)
    """

    def __init__(self, model_name: str = MODEL_NAME):
        """
        Load the Sentence-BERT model. Raises RuntimeError if the
        sentence-transformers package is not installed or the model
        cannot be loaded, so the caller can fall back gracefully.
        """
        self.model_name = model_name
        self.model = None
        self._load_time_seconds: Optional[float] = None
        self._load_model()

    # ------------------------------------------------------------------ #
    # Private helpers                                                       #
    # ------------------------------------------------------------------ #

    def _load_model(self) -> None:
        """
        Import SentenceTransformer and load the model, timing the load.
        All errors are caught and re-raised as RuntimeError with a clear
        message so the calling code can handle them without a stack trace.
        """
        try:
            from sentence_transformers import SentenceTransformer  # lazy import
            logger.info(f"Loading Sentence-BERT model: '{self.model_name}' ...")
            t0 = time.perf_counter()
            self.model = SentenceTransformer(self.model_name)
            self._load_time_seconds = round(time.perf_counter() - t0, 3)
            logger.info(f"Model loaded in {self._load_time_seconds}s.")
        except ImportError:
            raise RuntimeError(
                "The 'sentence-transformers' package is not installed. "
                "Run:  pip install sentence-transformers"
            )
        except Exception as exc:
            raise RuntimeError(
                f"Failed to load Sentence-BERT model '{self.model_name}': {exc}"
            )

    @staticmethod
    def _sanitize(text: Optional[str]) -> str:
        """
        Coerce input to a clean, non-empty string.

        Handles:
          - None / non-string types → empty string
          - Whitespace-only strings → empty string
          - Excessively long texts  → truncated at MAX_TEXT_CHARS
        """
        if not isinstance(text, str):
            return ""
        text = text.strip()
        if not text:
            return ""
        return text[:MAX_TEXT_CHARS]

    def _embed(self, texts: list[str]) -> np.ndarray:
        """
        Encode a list of strings into L2-normalised 384-d vectors.
        normalize_embeddings=True means cosine similarity == dot product.
        Returns shape (len(texts), 384).
        """
        return self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    # ------------------------------------------------------------------ #
    # Public API                                                            #
    # ------------------------------------------------------------------ #

    @property
    def load_time(self) -> Optional[float]:
        """Model load time in seconds (None if model not loaded yet)."""
        return self._load_time_seconds

    def score_single(
        self,
        resume_text: Optional[str],
        jd_text: Optional[str],
    ) -> dict:
        """
        Compute semantic similarity between one resume and one job description.

        Returns a dict:
        {
            "score":           float,   # cosine similarity in [0, 1]
            "inference_ms":    float,   # wall-clock inference time in ms
            "resume_tokens":   int,     # approximate word count of resume
            "jd_tokens":       int,     # approximate word count of JD
            "error":           str | None
        }
        """
        result = {
            "score": 0.0,
            "inference_ms": 0.0,
            "resume_tokens": 0,
            "jd_tokens": 0,
            "error": None,
        }

        try:
            resume = self._sanitize(resume_text)
            jd = self._sanitize(jd_text)

            if not resume:
                result["error"] = "resume_text is empty or missing"
                return result
            if not jd:
                result["error"] = "jd_text is empty or missing"
                return result

            result["resume_tokens"] = len(resume.split())
            result["jd_tokens"] = len(jd.split())

            t0 = time.perf_counter()
            embeddings = self._embed([resume, jd])
            # embeddings[0] → resume vector (shape 384,)
            # embeddings[1] → jd vector     (shape 384,)
            # sklearn_cosine expects 2-D arrays
            sim = float(sklearn_cosine(
                embeddings[0].reshape(1, -1),
                embeddings[1].reshape(1, -1)
            )[0][0])
            # Clamp to [0, 1] — normalised embeddings make this ≥ 0 already,
            # but we guard against any floating-point noise.
            sim = max(0.0, min(1.0, sim))
            result["inference_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            result["score"] = round(sim, 4)

        except Exception as exc:
            result["error"] = str(exc)

        return result

    def score_batch(
        self,
        resume_text: Optional[str],
        jd_texts: list[Optional[str]],
    ) -> list[dict]:
        """
        Compute semantic similarity between one resume and multiple JDs
        in a single forward pass (more efficient than calling score_single N times).

        Returns a list of dicts — same schema as score_single() — one per JD,
        in the same order as jd_texts.

        Skipped/empty JDs still get an entry with score=0.0 and an error message
        so the caller can match results by index safely.
        """
        if not jd_texts:
            return []

        results = []
        resume = self._sanitize(resume_text)

        if not resume:
            return [
                {
                    "score": 0.0,
                    "inference_ms": 0.0,
                    "resume_tokens": 0,
                    "jd_tokens": 0,
                    "error": "resume_text is empty or missing",
                }
                for _ in jd_texts
            ]

        # Sanitize all JDs; track which indices are valid
        sanitized_jds: list[str] = [self._sanitize(jd) for jd in jd_texts]
        valid_indices = [i for i, jd in enumerate(sanitized_jds) if jd]

        # Pre-fill results with zero-score placeholders
        placeholder = {
            "score": 0.0,
            "inference_ms": 0.0,
            "resume_tokens": len(resume.split()),
            "jd_tokens": 0,
            "error": "jd_text is empty or missing",
        }
        results = [dict(placeholder) for _ in jd_texts]

        if not valid_indices:
            return results

        try:
            texts_to_encode = [resume] + [sanitized_jds[i] for i in valid_indices]

            t0 = time.perf_counter()
            embeddings = self._embed(texts_to_encode)
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

            resume_vec = embeddings[0].reshape(1, -1)       # shape (1, 384)
            jd_vecs    = embeddings[1:]                     # shape (N, 384)

            # Batch cosine similarity: resume vs all valid JDs at once
            sims = sklearn_cosine(resume_vec, jd_vecs)[0]  # shape (N,)

            for rank, i in enumerate(valid_indices):
                sim = max(0.0, min(1.0, float(sims[rank])))
                results[i] = {
                    "score":         round(sim, 4),
                    "inference_ms":  elapsed_ms,       # total batch time
                    "resume_tokens": len(resume.split()),
                    "jd_tokens":     len(sanitized_jds[i].split()),
                    "error":         None,
                }

        except Exception as exc:
            # If batch fails, propagate error to all valid-index slots
            for i in valid_indices:
                results[i]["error"] = str(exc)

        return results


# ---------------------------------------------------------------------------
# Module-level convenience singleton
# ---------------------------------------------------------------------------
# This is lazy — the model is only loaded when get_matcher() is first called.
# This prevents import-time model loading when the module is imported by
# other scripts that may not need the model immediately.

_matcher_instance: Optional[SemanticMatcher] = None


def get_matcher() -> SemanticMatcher:
    """
    Return the shared SemanticMatcher singleton (loads model on first call).
    Thread-safety note: acceptable for single-threaded FYP use.
    """
    global _matcher_instance
    if _matcher_instance is None:
        _matcher_instance = SemanticMatcher()
    return _matcher_instance


def score_resume_vs_job(
    resume_text: Optional[str],
    jd_text: Optional[str],
) -> dict:
    """
    Module-level convenience function.
    Equivalent to get_matcher().score_single(resume_text, jd_text).
    Designed for Phase 2 integration into the existing pipeline.
    """
    return get_matcher().score_single(resume_text, jd_text)
