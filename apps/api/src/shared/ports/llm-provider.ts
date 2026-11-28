export interface SubConceptScore {
  name: string
  covered: boolean
  score: number
}

export interface FeynmanEvaluationAssessment {
  correctness: number
  clarity: number
  completeness: number
  feedback: {
    strengths: string[]
    missingConcepts: string[]
    improvementTip: string
  }
  subConcepts: SubConceptScore[]
  misconceptions: string[]
  nextPrompt: string
}

export interface FeynmanEvaluationResult extends FeynmanEvaluationAssessment {
  /** Backend-derived 0–10 score used as the scheduler input. */
  lectorScore: number
}

export interface FeynmanEvaluationInput {
  sourceContent: string
  userExplanation: string
  topic: string
}

export interface LLMProvider {
  evaluateFeynman(input: FeynmanEvaluationInput): Promise<FeynmanEvaluationAssessment>
}
