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

// OpenRouter serves most models from several providers at very different speeds, and picks
// one for you. Kimi K2.5 alone has five. Measured on this app's own CV prompt, the default
// choice was the slowest model in the lineup at 32s while producing the FEWEST output tokens,
// so it was a throughput problem rather than verbosity.
//
// MODEL_PROVIDERS pins an ordered preference list, e.g. "AtlasCloud,Novita". With it set,
// fallbacks are disabled so a slow provider cannot silently be substituted back in. Without
// it, providers are sorted by throughput.
//
// Worth knowing: several of the fastest endpoints are int4-quantized, which is part of why
// they are fast. MODEL_MIN_QUANT (e.g. "fp8,bf16,fp16") restricts routing to endpoints at or
// above a given precision when speed must not come at the cost of output quality.
export function providerConfig() {
  const pinned = String(process.env.MODEL_PROVIDERS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const quantizations = String(process.env.MODEL_MIN_QUANT || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  // Deliberately a no-op unless configured. sort:'throughput' was tried as the default and
  // measured unreliable: on the same model and prompt it picked a 30.6s provider on one call
  // and an 8.7s one on another, because it ranks on OpenRouter's own fluctuating stats. An
  // unpredictable route is worse than a steady one, so routing is left alone by default and
  // pinned explicitly when a model actually needs it.
  //
  // moonshotai/kimi-k2.5 needs it. Measured on this app's CV prompt, same profile, same
  // request, the only difference being which provider served it:
  //
  //   Venice           9.6s median (8.3-17.6 over 5 runs)   NOT quantized
  //   AtlasCloud      17.1s                                  int4
  //   Amazon Bedrock  19.5s
  //   Novita          20.6s
  //   SiliconFlow     33.9s                                  int4
  //   (no pin)        29.2s
  //
  // Hence MODEL_PROVIDERS=Venice,AtlasCloud in deployment: Venice first, AtlasCloud as the
  // only permitted fallback, so a Venice outage cannot quietly land on SiliconFlow at three
  // times the latency. Venice also happens to be the unquantized endpoint, so the fast path
  // is the higher-precision one rather than a quality trade.
  //
  // This lives in a comment because the value itself is an environment variable, and .env is
  // not in the repository.
  const provider = {};
  if (pinned.length) {
    provider.order = pinned;
    provider.allow_fallbacks = false;
  }
  if (quantizations.length) provider.quantizations = quantizations;

  return Object.keys(provider).length ? { provider } : {};
}
