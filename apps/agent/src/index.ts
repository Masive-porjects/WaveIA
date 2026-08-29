export {
  IntentProfileSchema,
  NEUTRAL_PROFILE,
  AXES,
  diffProfiles,
  validateProfile,
  type IntentProfile,
  type Axis,
  type AxisChange,
} from "./intentProfile.js";

export {
  SYSTEM_PROMPT,
  buildContextBlock,
  type TrackAnalysis,
} from "./prompt.js";

export {
  interpretIntent,
  IntentParseError,
  MODEL,
  type ChatTurn,
  type InterpretOptions,
  type InterpretResult,
} from "./agent.js";
