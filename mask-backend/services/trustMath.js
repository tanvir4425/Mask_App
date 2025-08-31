// mask-backend/services/trustMath.js — Bayesian trust (% with confidence band), env-tunable
const cfg = require("./trustConfig");

// Beta prior helper
function betaMean(alpha, beta) {
  return alpha / (alpha + beta);
}

// Wilson/Beta-ish interval (simple, stable)
function betaInterval(alpha, beta, z = 1.96) {
  // Using normal approximation to Beta for compactness
  const a = alpha;
  const b = beta;
  const n = a + b;
  const p = a / n;
  const varp = (a * b) / ((n * n) * (n + 1)); // Beta variance
  const d = z * Math.sqrt(varp);
  return [Math.max(0, p - d), Math.min(1, p + d)];
}

/**
 * computeTrust({ trueCount, falseCount, misleadingCount })
 * - false+misleading are penalized together
 * - alpha/beta (prior) are from env
 */
function computeTrust({ trueCount = 0, falseCount = 0, misleadingCount = 0 }) {
  const bad = Number(falseCount || 0) + Number(misleadingCount || 0);
  const good = Number(trueCount || 0);

  const alpha = cfg.PRIOR_ALPHA + good;
  const beta  = cfg.PRIOR_BETA  + bad;

  const mean = betaMean(alpha, beta); // 0..1
  const [low, high] = betaInterval(alpha, beta);

  // tier logic depends on maturity
  const checks = good + bad;
  let tier = "provisional";
  if (checks >= cfg.MATURITY_MIN) {
    if (mean >= 0.70) tier = "high";
    else if (mean < 0.40) tier = "low";
    else tier = "normal";
  }

  return {
    score: Math.round(mean * 100),
    confLow: Math.round(low * 100),
    confHigh: Math.round(high * 100),
    tier,
  };
}

module.exports = { computeTrust };
