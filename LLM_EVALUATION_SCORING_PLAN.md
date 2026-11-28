# LLM Evaluation Scoring and Dynamic Review Plan

## Goal

Make text and voice evaluations return a consistent, validated score that the backend can use as input to the existing spaced-repetition algorithm on every completed evaluation. The LLM evaluates the explanation; application code owns score normalization and review scheduling.

## Current Flow and Issues Found

1. `submitFeynmanEvaluation` transcribes voice input when needed, sends the note and explanation to the selected LLM provider, persists the result, and updates the note's schedule.
2. OpenAI and Gemini had separate copies of the prompt and JSON parser. Their parsers supplied fallback scores (including high defaults) when provider output was missing or zero.
3. Calibration applies explanation-length, concept-coverage, and misconception caps, then derives `lectorScore`. Its weights summed to a 0–100 score but the output was clamped to 10, which could collapse good results to 10.
4. The scheduler consumes the overall score, maps it to SM-2 quality, and uses the current repetition state and calendar deadlines to compute the next interval. The LLM's suggested interval was saved and returned instead of the scheduler's actual interval.
5. Several evaluation test fixtures used `lectorScore: 85`, although the scheduler expects a 0–10 value.

## Implementation Contract

- LLM providers return only a structured assessment: correctness, clarity, completeness (each integer 0–100), feedback, 1–6 sub-concepts, misconceptions, and one follow-up prompt.
- A shared prompt and Zod parser define the provider-independent contract. Missing fields, malformed JSON, and values outside the contract fail the evaluation; valid zero values remain zero.
- Backend calibration applies the existing response-length, sub-concept-coverage, and misconception caps. It then computes `lectorScore` as `round1((correctness × 0.5 + clarity × 0.3 + completeness × 0.2) / 10)`, yielding 0–10.
- The backend passes this score and the calibrated dimensions into the current scheduler every time. SM-2 behavior, study mode, exam date, and important-date compression remain the scheduling authority.
- The existing `retentionImpact` API and database shape remain compatible, but new evaluations fill it from the scheduler's computed interval and a reason that reflects the score, review history, and relevant dates. Provider output cannot select the interval.
- The same calibration path is used for real providers and the mock provider. The web response shape remains unchanged.

## Verification Plan

- Unit-test weighted score normalization, calibration caps, zero scores, parser schema validation, malformed JSON, missing fields, and out-of-range values.
- Test that text and voice evaluations save and return the same normalized score and scheduler-derived interval.
- Retain spaced-repetition coverage for score-to-quality mapping, repetition state, exam compression, important-date compression, and retention health.
- Run the API type check/build and API tests after implementation.

## Implementation Status

- [x] Shared prompt and validated assessment parser
- [x] Backend-owned score calibration and scheduler-derived interval
- [x] Provider and mock contract alignment
- [x] Regression tests for score and persisted interval
- [x] API build passed
- [x] Full API test suite passed (17 files, 92 tests), including repeated-review scheduling
