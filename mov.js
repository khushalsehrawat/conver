/*
  Local MOV converter (no uploads):
  - MOV -> MP4 via ffmpeg.wasm
  - MOV -> JPG (first frame) via ffmpeg.wasm
  - Per-file download + optional bulk ZIP
*/

const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");
const btnUpload = document.getElementById("btnUpload");
const btnUploadFolder = document.getElementById("btnUploadFolder");
const dropZone = document.getElementById("dropZone");

const info = document.getElementById("info");
const fileList = document.getElementById("fileList");
const fileItems = document.getElementById("fileItems");
const btnConvert = document.getElementById("btnConvert");
const btnDownloadAll = document.getElementById("btnDownloadAll");

const outputNameInput = document.getElementById("outputName");
const optMp4 = document.getElementById("optMp4");
const optJpg = document.getElementById("optJpg");
const crfInput = document.getElementById("crf");
const crfLabel = document.getElementById("crfLabel");
const jpgQInput = document.getElementById("jpgQ");
const jpgQLabel = document.getElementById("jpgQLabel");

const selectAllBtn = document.getElementById("selectAll");
const clearAllBtn = document.getElementById("clearAll");

const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

let videos = [];
let sourceRootFolder = "";
let ffmpeg = null;
let ffmpegLoadPromise = null;
let progressContext = { processedBefore: 0, totalJobs: 1 };

function syncSliders() {
  if (crfLabel) crfLabel.textContent = String(crfInput?.value ?? "");
  if (jpgQLabel) jpgQLabel.textContent = String(jpgQInput?.value ?? "");
  if (crfInput) crfInput.disabled = !optMp4?.checked;
  if (jpgQInput) jpgQInput.disabled = !optJpg?.checked;
  updateActionButtons();
}

crfInput?.addEventListener("input", syncSliders);
jpgQInput?.addEventListener("input", syncSliders);
optMp4?.addEventListener("change", syncSliders);
optJpg?.addEventListener("change", syncSliders);
syncSliders();

btnUpload?.addEventListener("click", () => fileInput?.click());
btnUploadFolder?.addEventListener("click", () => folderInput?.click());

dropZone?.addEventListener("click", () => fileInput?.click());
dropZone?.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") fileInput?.click();
});

["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
  dropZone?.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
  });
});

["dragenter", "dragover"].forEach(evt => {
  dropZone?.addEventListener(evt, () => dropZone.classList.add("dragover"));
});

["dragleave", "drop"].forEach(evt => {
  dropZone?.addEventListener(evt, () => dropZone.classList.remove("dragover"));
});

if (fileInput) fileInput.onchange = () => loadPickedFiles([...fileInput.files]);
if (folderInput) folderInput.onchange = () => loadPickedFiles([...folderInput.files]);

dropZone?.addEventListener("drop", async e => {
  try {
    const filesWithPaths = await getFilesFromDataTransfer(e.dataTransfer);
    loadPickedFiles(filesWithPaths);
  } catch (err) {
    showInfo(`Drop failed: ${escapeHtml(normalizeErrorMessage(err))}`);
  }
});

selectAllBtn?.addEventListener("click", () => {
  videos.forEach(v => (v.selected = true));
  renderList();
  updateActionButtons();
});

clearAllBtn?.addEventListener("click", () => {
  videos.forEach(v => (v.selected = false));
  renderList();
  updateActionButtons();
});

fileItems?.addEventListener("change", e => {
  const input = e.target?.closest?.("input[type='checkbox'][data-index]");
  if (!input) return;
  const index = Number(input.dataset.index);
  if (!Number.isFinite(index) || !videos[index]) return;
  videos[index].selected = !!input.checked;
  updateActionButtons();
});

fileItems?.addEventListener("click", async e => {
  const btn = e.target?.closest?.("[data-download]");
  if (!btn) return;
  const index = Number(btn.dataset.download);
  if (!Number.isFinite(index) || !videos[index]) return;
  await downloadOutputs(videos[index]);
});

btnConvert?.addEventListener("click", convertSelected);
btnDownloadAll?.addEventListener("click", downloadAllAsZip);

function showInfo(html) {
  if (!info) return;
  info.classList.remove("d-none");
  info.innerHTML = html;
}

function hideInfo() {
  if (!info) return;
  info.classList.add("d-none");
  info.innerHTML = "";
}

function updateActionButtons() {
  const hasSelected = videos.some(v => v.selected);
  const hasOutputsEnabled = !!optMp4?.checked || !!optJpg?.checked;
  if (btnConvert) btnConvert.disabled = !hasSelected || !hasOutputsEnabled;
  if (btnDownloadAll) btnDownloadAll.disabled = !videos.some(v => (v.outputs || []).length);
}

function loadPickedFiles(filesOrFilesWithPaths) {
  hideInfo();

  const all = filesOrFilesWithPaths.map(f => {
    if (f && typeof f === "object" && "file" in f) return f;
    return { file: f, relativePath: f?.webkitRelativePath || "" };
  });

  const picked = all.filter(({ file }) => isMovLikeFile(file));
  sourceRootFolder = detectCommonRootFolder(picked);

  videos = picked.map(({ file, relativePath }) => ({
    file,
    relativePath: relativePath || "",
    selected: true,
    status: "pending", // pending | converting | converted | error
    outputs: [],
    error: null
  }));

  if (!videos.length) {
    showInfo(`<strong>0</strong> MOV files loaded`);
    if (fileList) fileList.classList.add("d-none");
    updateActionButtons();
    return;
  }

  if (!outputNameInput?.value?.trim()) {
    const suggestion = suggestOutputFolderName(picked, sourceRootFolder);
    outputNameInput.value = `${suggestion}_Converted`;
  }

  const skipped = all.length - picked.length;
  showInfo(
    `<strong>${videos.length}</strong> videos loaded` +
      (skipped ? ` <span class="text-muted">(skipped ${skipped} non‑MOV files)</span>` : "")
  );

  renderList();
  updateActionButtons();
}

function renderList() {
  if (!fileItems || !fileList) return;
  fileItems.innerHTML = "";
  fileList.classList.remove("d-none");

  videos.forEach((vid, index) => {
    const row = document.createElement("div");
    row.className = "list-group-item image-row";
    row.dataset.row = String(index);

    const { badgeClass, badgeText } = getStatusBadge(vid);
    const displayName = escapeHtml(stripSourceRoot(vid.relativePath) || vid.file.name);

    row.innerHTML = `
      <div class="image-row-left">
        <input type="checkbox" ${vid.selected ? "checked" : ""} data-index="${index}">
        <span class="ms-2">${displayName}</span>
        <small class="ms-2">(${formatBytes(vid.file.size)})</small>
        <span class="badge ${badgeClass} ms-2" data-status>${badgeText}</span>
        ${vid.error ? `<small class="text-danger ms-2">${escapeHtml(vid.error)}</small>` : ""}
      </div>
      <button class="btn btn-sm btn-outline-primary" data-download="${index}" ${vid.outputs?.length ? "" : "disabled"}>
        ${downloadButtonLabel(vid)}
      </button>
    `;
    fileItems.appendChild(row);
  });
}

function updateRow(index) {
  const row = fileItems?.querySelector?.(`[data-row="${index}"]`);
  if (!row) return;
  const vid = videos[index];
  if (!vid) return;

  const checkbox = row.querySelector("input[type='checkbox']");
  if (checkbox) checkbox.checked = !!vid.selected;

  const badge = row.querySelector("[data-status]");
  if (badge) {
    const { badgeClass, badgeText } = getStatusBadge(vid);
    badge.className = `badge ${badgeClass} ms-2`;
    badge.textContent = badgeText;
  }

  const downloadBtn = row.querySelector("[data-download]");
  if (downloadBtn) {
    downloadBtn.disabled = !vid.outputs?.length;
    downloadBtn.textContent = downloadButtonLabel(vid);
  }
}

async function convertSelected() {
  const selectedIndexes = videos
    .map((v, i) => (v.selected ? i : -1))
    .filter(i => i !== -1);
  if (!selectedIndexes.length) return;

  if (!optMp4?.checked && !optJpg?.checked) {
    showInfo("Choose at least one output: MP4 and/or JPG.");
    return;
  }

  btnConvert.disabled = true;
  if (progressWrap) progressWrap.classList.remove("d-none");
  if (progressBar) progressBar.style.width = "0%";

  const total = selectedIndexes.length;
  const crf = clampInt(Number(crfInput?.value ?? 23), 18, 30);
  const jpgQ = clampInt(Number(jpgQInput?.value ?? 3), 2, 10);

  try {
    await ensureFfmpegLoaded(total);
  } catch (err) {
    showInfo(`Failed to load converter engine: ${escapeHtml(normalizeErrorMessage(err))}`);
    btnConvert.disabled = false;
    updateActionButtons();
    return;
  }

  let processed = 0;
  for (const index of selectedIndexes) {
    processed += 1;

    const vid = videos[index];
    vid.status = "converting";
    vid.outputs = [];
    vid.error = null;
    updateRow(index);

    progressContext = { processedBefore: processed - 1, totalJobs: total };
    setProgressText(`Converting ${processed} of ${total}…`);
    setProgressPct(((processed - 1) / total) * 100);

    try {
      const outputs = await convertSingle(vid.file, { mp4: optMp4.checked, jpg: optJpg.checked, crf, jpgQ });
      vid.outputs = outputs;
      vid.status = "converted";
    } catch (err) {
      vid.status = "error";
      vid.error = normalizeErrorMessage(err);
    } finally {
      updateRow(index);
    }
  }

  const failures = selectedIndexes.filter(i => videos[i].status === "error").length;
  setProgressPct(100);
  setProgressText(
    failures
      ? `Done. Converted ${total - failures}/${total} (failed ${failures}).`
      : `Done. Converted ${total}/${total}.`
  );

  btnConvert.disabled = false;
  updateActionButtons();
}

async function ensureFfmpegLoaded(totalJobs) {
  if (ffmpeg) return;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  if (!window.FFmpeg?.createFFmpeg || !window.FFmpeg?.fetchFile) {
    throw new Error("ffmpeg.wasm library failed to load");
  }

  const { createFFmpeg } = window.FFmpeg;

  ffmpeg = createFFmpeg({
    log: false,
    corePath: "https://unpkg.com/@ffmpeg/core@0.11.6/dist/ffmpeg-core.js"
  });

  ffmpeg.setProgress(({ ratio }) => {
    const base = Number(progressContext?.processedBefore || 0);
    const total = Math.max(Number(progressContext?.totalJobs || 1), 1);
    const overall = (base + Number(ratio || 0)) / total;
    setProgressPct(overall * 100);
  });

  setProgressText("Preparing conversion engine (first time may take a moment)…");
  setProgressPct(10);

  ffmpegLoadPromise = ffmpeg
    .load()
    .then(() => {
      setProgressPct(0);
      setProgressText("");
    })
    .finally(() => {
      ffmpegLoadPromise = null;
    });

  return ffmpegLoadPromise;
}

async function convertSingle(file, { mp4, jpg, crf, jpgQ }) {
  const { fetchFile } = window.FFmpeg;
  const base = sanitizeBaseName(baseName(file?.name || "video"));

  const inName = `${base}-${Date.now()}-input.mov`;
  const inData = await fetchFile(file);
  ffmpeg.FS("writeFile", inName, inData);

  const outputs = [];
  try {
    if (mp4) {
      const outMp4 = `${base}.mp4`;
      await runMp4Transcode(inName, outMp4, crf);
      const mp4Data = ffmpeg.FS("readFile", outMp4);
      outputs.push({ fileName: outMp4, blob: new Blob([mp4Data], { type: "video/mp4" }) });
      safeUnlink(outMp4);
    }

    if (jpg) {
      const outJpg = `${base}.jpg`;
      await ffmpeg.run("-i", inName, "-frames:v", "1", "-q:v", String(jpgQ), outJpg);
      const jpgData = ffmpeg.FS("readFile", outJpg);
      outputs.push({ fileName: outJpg, blob: new Blob([jpgData], { type: "image/jpeg" }) });
      safeUnlink(outJpg);
    }
  } finally {
    safeUnlink(inName);
  }

  if (!outputs.length) throw new Error("No outputs generated");
  return outputs;
}

async function runMp4Transcode(inName, outName, crf) {
  const argsWithAudio = [
    "-i",
    inName,
    "-map",
    "0:v:0?",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    String(crf),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outName
  ];

  try {
    await ffmpeg.run(...argsWithAudio);
  } catch {
    const argsNoAudio = [
      "-i",
      inName,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      String(crf),
      "-an",
      "-movflags",
      "+faststart",
      outName
    ];
    await ffmpeg.run(...argsNoAudio);
  }
}

async function downloadOutputs(vid) {
  const outputs = vid.outputs || [];
  if (!outputs.length) return;

  if (outputs.length === 1) {
    saveAs(outputs[0].blob, outputs[0].fileName);
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder(baseName(vid.file.name));
  for (const out of outputs) folder.file(out.fileName, out.blob);
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${baseName(vid.file.name)}.zip`);
}

async function downloadAllAsZip() {
  const allOutputs = videos.flatMap(v => v.outputs || []);
  if (!allOutputs.length) return;

  const zip = new JSZip();
  const outputFolderName = (outputNameInput?.value || "").trim() || "Converted";
  const folder = zip.folder(outputFolderName);
  const usedZipPaths = new Set();

  for (const vid of videos) {
    for (const out of vid.outputs || []) {
      const rel = stripSourceRoot(vid.relativePath);
      const destPath = rel ? parentDir(rel) : "";
      const destFolder = destPath ? folder.folder(destPath) : folder;
      const uniqueName = uniqueFileName(out.fileName, usedZipPaths, destPath);
      destFolder.file(uniqueName, out.blob);
    }
  }

  setProgressText("Building ZIP…");
  setProgressPct(100);
  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `${outputFolderName}.zip`);
  setProgressText("");
  updateActionButtons();
}

function isMovLikeFile(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  if (type === "video/quicktime") return true;
  const n = String(file.name || "").toLowerCase();
  return n.endsWith(".mov");
}

function getStatusBadge(item) {
  switch (item.status) {
    case "converting":
      return { badgeClass: "text-bg-warning", badgeText: "Converting" };
    case "converted":
      return { badgeClass: "text-bg-success", badgeText: "Converted" };
    case "error":
      return { badgeClass: "text-bg-danger", badgeText: "Failed" };
    default:
      return { badgeClass: "text-bg-secondary", badgeText: "Pending" };
  }
}

function downloadButtonLabel(item) {
  const count = item.outputs?.length || 0;
  if (count <= 1) return "Download";
  return `Download (${count})`;
}

function setProgressPct(pct) {
  if (!progressBar) return;
  progressBar.style.width = `${clampInt(Number(pct), 0, 100)}%`;
}

function setProgressText(text) {
  if (!progressText) return;
  progressText.textContent = String(text || "");
}

function normalizeErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

function formatBytes(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  const value = b / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function baseName(fileName) {
  return String(fileName || "file").replace(/\.[^/.]+$/, "");
}

function sanitizeBaseName(name) {
  return String(name || "file")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";
}

function clampInt(value, min, max) {
  const v = Math.round(Number(value));
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
}

function safeUnlink(path) {
  try {
    ffmpeg?.FS?.("unlink", path);
  } catch {
    // ignore
  }
}

function suggestOutputFolderName(filesWithPaths, rootFolder) {
  if (rootFolder) return rootFolder;
  const first = filesWithPaths.find(f => f.file)?.file;
  const firstRel = filesWithPaths.find(f => f.relativePath)?.relativePath || first?.webkitRelativePath || "";
  const fromRel = String(firstRel).split("/")[0];
  return fromRel || "Videos";
}

function parentDir(path) {
  const p = String(path || "").replace(/\\/g, "/");
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function detectCommonRootFolder(filesWithPaths) {
  const roots = new Set();
  for (const fp of filesWithPaths) {
    const rp = String(fp.relativePath || "");
    if (!rp.includes("/")) return "";
    const root = rp.split("/")[0];
    if (!root) return "";
    roots.add(root);
    if (roots.size > 1) return "";
  }
  return roots.values().next().value || "";
}

function stripSourceRoot(relativePath) {
  const rp = String(relativePath || "").replace(/\\/g, "/");
  if (!sourceRootFolder) return rp;
  const prefix = `${sourceRootFolder}/`;
  if (rp.startsWith(prefix)) return rp.slice(prefix.length);
  return rp;
}

function uniqueFileName(fileName, usedPaths, destPath) {
  const name = String(fileName || "file.bin");
  const prefix = destPath ? `${destPath}/` : "";
  const full = `${prefix}${name}`;
  if (!usedPaths.has(full)) {
    usedPaths.add(full);
    return name;
  }

  const extMatch = name.match(/(\.[^/.]+)$/);
  const ext = extMatch ? extMatch[1] : "";
  const stem = ext ? name.slice(0, -ext.length) : name;
  let i = 2;
  while (true) {
    const candidate = `${stem}-${i}${ext}`;
    const fullCandidate = `${prefix}${candidate}`;
    if (!usedPaths.has(fullCandidate)) {
      usedPaths.add(fullCandidate);
      return candidate;
    }
    i += 1;
  }
}

async function getFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return [];

  const items = [...(dataTransfer.items || [])];
  const hasEntries = items.some(it => typeof it.webkitGetAsEntry === "function");

  if (!items.length || !hasEntries) {
    return [...(dataTransfer.files || [])].map(file => ({
      file,
      relativePath: file?.webkitRelativePath || ""
    }));
  }

  const results = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (!entry) continue;
    const collected = await collectFilesFromEntry(entry, "");
    results.push(...collected);
  }
  return results;
}

async function collectFilesFromEntry(entry, basePath) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => {
      entry.file(resolve, reject);
    });
    return [{ file, relativePath: `${basePath}${file.name}` }];
  }

  if (!entry.isDirectory) return [];

  const dirPath = `${basePath}${entry.name}/`;
  const reader = entry.createReader();
  const entries = [];

  while (true) {
    const batch = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) break;
    entries.push(...batch);
  }

  const nested = await Promise.all(entries.map(e => collectFilesFromEntry(e, dirPath)));
  return nested.flat();
}
