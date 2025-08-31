// mask-backend/utils/reservedNames.js
function normalizeName(s = "") {
  const map = { "0":"o", "1":"i", "3":"e", "4":"a", "5":"s", "7":"t" };
  return String(s).toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^\w]+/g, "")                            // remove non-letters/digits/_ 
    .replace(/[013457]/g, (d)=>map[d]);                // leet → letters
}
const RESERVED = [
  "admin","administrator","moderator","mod","support","staff","official",
  "superadmin","root","owner","system","sysop","team","security","help"
];
function isReservedPseudonym(pseudonym) {
  const n = normalizeName(pseudonym);
  return RESERVED.some((r) => n.includes(r));
}
module.exports = { isReservedPseudonym };
