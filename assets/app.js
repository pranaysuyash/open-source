(() => {
  const $ = (id) => document.getElementById(id);
  const state = { imageDataUrl: '', result: null, responseId: null, visualObj: null, synthControl: null, pass: 1, demo: false };

  const demoResult = {
    title: "Minuet study",
    composer: "Sample fixture",
    key: "G major",
    meter: "3/4",
    tempo: "Quarter = 108",
    confidence: 92,
    detected_parts: ["Violin"],
    summary: "A clear single-line melody with one intentionally flagged accidental.",
    changes: [],
    uncertainties: [{ location: "Measure 6", issue: "The accidental before F is faint; interpreted as F-sharp from the key signature.", confidence: 71 }],
    abc: `X:1\nT:Minuet study\nC:Sample fixture\nM:3/4\nL:1/8\nQ:1/4=108\nK:G\n|: G2 B2 d2 | g4 d2 | e2 c2 A2 | D6 | G2 B2 d2 | f4 e2 | d2 B2 A2 | G6 :|`
  };

  const showError = (message) => {
    $('errorbar').textContent = message;
    $('errorbar').style.display = 'block';
  };
  const clearError = () => { $('errorbar').style.display = 'none'; };

  function setLoading(on, mode='transcribe') {
    $('loading').style.display = on ? 'flex' : 'none';
    $('loadingTitle').textContent = mode === 'verify' ? 'Astra is checking its reconstruction' : 'Astra is reading the score';
    $('loadingCopy').textContent = mode === 'verify'
      ? 'Comparing the original image against the candidate notation and changing only concrete mismatches.'
      : 'Reconstructing visible notation and keeping ambiguous measures explicit.';
  }

  async function resizeImage(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = dataUrl;
    });
    const maxDim = 1800;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .86);
  }

  async function restore(mode='transcribe') {
    clearError();
    if (!state.imageDataUrl) return showError('Choose a score image first.');
    setLoading(true, mode);
    try {
      const response = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: state.imageDataUrl,
          mode,
          currentAbc: state.result?.abc || '',
          instruction: $('steerText').value.trim(),
          previousResponseId: state.responseId
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Restoration failed.');
      state.result = payload.result;
      state.responseId = payload.responseId || null;
      state.pass = mode === 'verify' ? state.pass + 1 : 1;
      state.demo = false;
      renderResult();
    } catch (err) {
      showError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function renderResult() {
    const r = state.result;
    $('emptyState').style.display = 'none';
    $('resultState').style.display = 'grid';
    $('scanImage').src = state.imageDataUrl || 'assets/sample-score.svg';
    $('scoreTitle').textContent = r.title || 'Untitled score';
    $('scoreComposer').textContent = r.composer || 'Composer not visible';
    $('factKey').textContent = r.key || '—';
    $('factMeter').textContent = r.meter || '—';
    $('factTempo').textContent = r.tempo || '—';
    $('factParts').textContent = r.detected_parts?.length ? r.detected_parts.join(', ') : '—';
    $('confidenceValue').textContent = `${r.confidence}%`;
    $('confidenceRing').style.setProperty('--p', r.confidence);
    $('confidenceCopy').textContent = r.summary || 'Astra reconstruction complete.';
    $('passLabel').textContent = state.demo ? 'Preview' : `Pass ${state.pass}`;

    const u = $('uncertainties'); u.innerHTML = '';
    if (!r.uncertainties?.length) {
      u.innerHTML = '<div class="empty-note">No specific uncertain readings were reported in this pass.</div>';
    } else {
      r.uncertainties.forEach(item => {
        const el = document.createElement('div'); el.className='uncertainty';
        el.innerHTML = `<b>${escapeHtml(item.location)} · ${item.confidence}%</b>${escapeHtml(item.issue)}`;
        u.appendChild(el);
      });
    }
    renderAbc(r.abc);
  }

  function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function renderAbc(abc) {
    $('paper').innerHTML = '';
    $('audio').innerHTML = '';
    if (!window.ABCJS) {
      const pre = document.createElement('pre');
      pre.className = 'abc-fallback';
      pre.textContent = abc;
      $('paper').innerHTML = '<div class="empty-note" style="margin-bottom:12px">Music engraving could not load. The symbolic reconstruction is still available below.</div>';
      $('paper').appendChild(pre);
      $('audio').innerHTML = '<div class="empty-note">Playback becomes available when the notation renderer is reachable.</div>';
      return;
    }
    try {
      state.visualObj = ABCJS.renderAbc('paper', abc, { responsive: 'resize', add_classes: true, staffwidth: 740 });
      if (ABCJS.synth?.supportsAudio?.() && state.visualObj?.[0]) {
        const synthControl = new ABCJS.synth.SynthController();
        synthControl.load('#audio', null, { displayRestart:true, displayPlay:true, displayProgress:true, displayWarp:true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: state.visualObj[0] }).then(() => synthControl.setTune(state.visualObj[0], false)).catch(() => {
          $('audio').innerHTML = '<div class="empty-note">Playback could not initialize, but the restored notation is still available.</div>';
        });
        state.synthControl = synthControl;
      }
    } catch (err) {
      $('paper').innerHTML = `<div class="uncertainty"><b>ABC render error</b>${escapeHtml(err.message || String(err))}</div>`;
    }
  }

  function loadPreview() {
    state.imageDataUrl = 'assets/sample-score.svg';
    state.result = demoResult;
    state.responseId = null;
    state.pass = 1;
    state.demo = true;
    renderResult();
  }

  $('fileInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    clearError();
    try {
      state.imageDataUrl = await resizeImage(file);
      $('scanImage').src = state.imageDataUrl;
      await restore('transcribe');
    } catch (err) { showError(err.message || 'Could not read the image.'); }
  });

  const drop = $('dropZone');
  ['dragenter','dragover'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave','drop'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', async e => {
    const file = e.dataTransfer.files?.[0]; if (!file || !file.type.startsWith('image/')) return showError('Drop an image file.');
    try { state.imageDataUrl = await resizeImage(file); await restore('transcribe'); } catch(err) { showError(err.message || 'Could not read the image.'); }
  });

  $('previewBtn').addEventListener('click', loadPreview);
  $('verifyBtn').addEventListener('click', () => restore('verify'));
  $('newScoreBtn').addEventListener('click', () => { location.reload(); });
  $('copyBtn').addEventListener('click', async () => {
    if (!state.result?.abc) return;
    await navigator.clipboard.writeText(state.result.abc);
    const old = $('copyBtn').textContent; $('copyBtn').textContent='Copied'; setTimeout(() => $('copyBtn').textContent=old, 1200);
  });
  $('downloadBtn').addEventListener('click', () => {
    if (!state.result?.abc) return;
    const blob = new Blob([state.result.abc], {type:'text/plain'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=((state.result.title || 'restored-score').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'restored-score') + '.abc';
    a.click(); URL.revokeObjectURL(a.href);
  });
})();
