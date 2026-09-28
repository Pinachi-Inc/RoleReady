// Most current models reason by default, and on OpenRouter the reasoning tokens are drawn
// from max_tokens rather than billed separately on top of it. Measured against this app's
// own CV prompt at max_tokens 4000: gpt-5-mini, deepseek-v4-pro, kimi-k2.5 and claude-sonnet-5
// each spent the entire budget thinking and returned an empty string. The finish reason looks
// normal, so the failure shows up as a blank CV rather than an error.
//
// Every prompt in this app asks for a fixed JSON shape or a three-paragraph letter from data
// that is already supplied. None of that needs a scratchpad, so reasoning is off by default.
// Set MODEL_REASONING=true to turn it back on, and raise max_tokens well above the output
// you actually want if you do.
//
// Note some endpoints refuse to disable it ("Reasoning is mandatory for this endpoint and
// cannot be disabled", openai/gpt-5-mini). Those need a larger budget instead of this flag.
export function reasoningConfig() {
  if (String(process.env.MODEL_REASONING || '').toLowerCase() === 'true') return {};
  return { reasoning: { enabled: false } };
}
