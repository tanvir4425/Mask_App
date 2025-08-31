// src/new-ui/reportDialog.js
// Tiny vanilla JS dialog so you don't have to refactor PostCard.
// Usage: openReportDialog({ postId: "..." })
export function openReportDialog({ postId }) {
  if (!postId) {
    alert("Missing post id");
    return;
  }

  // Prevent multiple dialogs
  const existing = document.getElementById("mask-report-dialog");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "mask-report-dialog";
  overlay.className =
    "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4";

  // Reasons list (you can reorder or tweak labels freely)
  const reasons = [
    "Offensive",
    "Harassment",
    "Hate speech",
    "Nudity",
    "Illegal activity",
    "Self-harm",
    "Spam",
    "False/Misleading",
    "Rumor",
    "Scam/Fraud",
    "Privacy violation",
    "Other",
  ];

  overlay.innerHTML = `
    <div class="w-full max-w-md rounded-2xl shadow-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
      <div class="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div class="text-base font-semibold">Report post</div>
        <div class="text-xs text-zinc-500 mt-0.5">Pick a reason and (optionally) add details.</div>
      </div>

      <div class="p-4 max-h-[70vh] overflow-y-auto">
        <div class="space-y-2" role="radiogroup" aria-label="Report reason">
          ${reasons
            .map(
              (label, idx) => `
            <label class="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
              <input class="mt-1" type="radio" name="mask-report-reason" value="${label}" ${idx===0?"checked":""} />
              <span class="text-sm">${label}</span>
            </label>`
            )
            .join("")}
        </div>

        <div id="mask-report-note-wrap" class="mt-3 hidden">
          <label class="text-xs text-zinc-500 block mb-1">Describe the issue</label>
          <textarea id="mask-report-note" rows="3"
            class="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent p-2 text-sm"
            placeholder="Add context (optional)…"></textarea>
          <div id="mask-report-count" class="text-[11px] text-zinc-500 mt-1">0 / 400</div>
        </div>
      </div>

      <div class="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2">
        <button id="mask-report-cancel" class="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm">Cancel</button>
        <button id="mask-report-submit" class="px-3 py-1.5 rounded-md bg-sky-600 text-white text-sm">Submit</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Elements
  const noteWrap = overlay.querySelector("#mask-report-note-wrap");
  const noteEl = overlay.querySelector("#mask-report-note");
  const countEl = overlay.querySelector("#mask-report-count");
  const cancelBtn = overlay.querySelector("#mask-report-cancel");
  const submitBtn = overlay.querySelector("#mask-report-submit");

  // Show textarea when "Other" is selected; hide otherwise (but keep allowed for others too)
  function updateNoteVisibility() {
    const reason = getSelectedReason();
    if (reason === "Other") {
      noteWrap.classList.remove("hidden");
    } else {
      noteWrap.classList.add("hidden");
    }
  }

  function getSelectedReason() {
    const r = overlay.querySelector('input[name="mask-report-reason"]:checked');
    return r ? r.value : "";
  }

  // Textarea counter and max length
  function updateCounter() {
    const text = (noteEl?.value || "").slice(0, 400);
    if (noteEl && text !== noteEl.value) noteEl.value = text;
    if (countEl) countEl.textContent = `${text.length} / 400`;
  }

  overlay.addEventListener("change", (e) => {
    if (e.target && e.target.name === "mask-report-reason") updateNoteVisibility();
  });
  noteEl?.addEventListener("input", updateCounter);
  updateNoteVisibility();
  updateCounter();

  // Close handlers
  function close() {
    window.removeEventListener("keydown", onKey);
    overlay.removeEventListener("click", onBackClick);
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function onBackClick(e) {
    if (e.target === overlay) close();
  }
  window.addEventListener("keydown", onKey);
  overlay.addEventListener("click", onBackClick);

  cancelBtn?.addEventListener("click", close);

  // Submit
  submitBtn?.addEventListener("click", async () => {
    try {
      const reason = getSelectedReason();
      let note = (noteEl?.value || "").trim();
      const payload = {
        targetType: "post",
        postId,
        reason: String(reason || "other").slice(0, 100),
        note: String(note || "").slice(0, 400),
      };

      // If Other chosen, gently require a few chars
      if (reason === "Other" && note.length < 3) {
        alert("Please add a short note for 'Other'.");
        return;
      }

      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      alert("Thanks. Your report was submitted.");
      close();
    } catch (err) {
      alert(err?.message || "Failed to submit report.");
    }
  });
}
