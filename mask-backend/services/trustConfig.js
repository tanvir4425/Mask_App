// mask-backend/services/trustConfig.js
function num(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : def;
}
function bool(name, def) {
  const v = process.env[name];
  if (v == null) return def;
  return v === "1" || /^(true|yes|on)$/i.test(v);
}

// allow both styles: TRUST_MIN_CONF_STRONG or TRUST_CONTEXT_HIGH, etc.
const STRONG = num("TRUST_MIN_CONF_STRONG",
              num("TRUST_CONTEXT_HIGH", 0.80));
const CONTEXT = num("TRUST_MIN_CONF_CONTEXT",
               num("TRUST_CONTEXT_LOW", 0.60));

const ALPHA = num("TRUST_PRIOR_ALPHA", 8);
const BETA  = num("TRUST_PRIOR_BETA", 8);

const MATURITY = num("TRUST_MATURITY_MIN_POSTS",
                num("TRUST_MATURITY_MIN", 10));

module.exports = {
  ENABLED: bool("TRUST_ENABLED", true),

  PRIOR_ALPHA: ALPHA,
  PRIOR_BETA:  BETA,

  CONTEXT_LOW:  CONTEXT,  // “Context suggested” threshold
  CONTEXT_HIGH: STRONG,   // Strong warning threshold

  MATURITY_MIN: MATURITY,

  TTL_HOURS: num("TRUST_TTL_HOURS", 24),
};
