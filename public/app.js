/**
 * public/app.js
 * 
 * Vanilla JavaScript controller for Admin Pressure Map.
 * Core Principle: "Find Unfair Targets, Not Faulty Workers."
 */

// Application State
const state = {
  summary: null,
  findings: [],
  filters: {
    district: 'All',
    block: 'All',
    month: 'All',
    status: 'All'
  },
  selectedRow: null,
  chartInstance: null,
  mapInstance: null,
  mapMarkersGroup: null
};

// DOM Elements
const kpiReviewedEl = document.getElementById('kpi-reviewed');
const kpiReviewNeededEl = document.getElementById('kpi-review-needed');
const kpiUnfairEl = document.getElementById('kpi-unfair');
const kpiErrorsEl = document.getElementById('kpi-errors');
const kpiSuppressedEl = document.getElementById('kpi-suppressed');

const filterDistrictEl = document.getElementById('filter-district');
const filterBlockEl = document.getElementById('filter-block');
const filterMonthEl = document.getElementById('filter-month');
const filterStatusEl = document.getElementById('filter-status');
const filterResetBtn = document.getElementById('filter-reset-btn');

const tableBodyEl = document.getElementById('table-body');
const tableCountEl = document.getElementById('table-count');

const btnLoadDemo = document.getElementById('btn-load-demo');
const btnUploadCsv = document.getElementById('btn-upload-csv');
const btnExportCsv = document.getElementById('btn-export-csv');

// Chart & Map Elements
const chartCanvas = document.getElementById('district-chart');
const chartEmptyState = document.getElementById('chart-empty-state');
const chartSummaryText = document.getElementById('chart-summary-text');

// Details Panel Elements
const detailsBackdrop = document.getElementById('details-backdrop');
const detailsPanel = document.getElementById('details-panel');
const detailsCloseBtn = document.getElementById('details-close-btn');
const detailTitleEl = document.getElementById('detail-title');
const detailStatusEl = document.getElementById('detail-status');
const detailMetricsEl = document.getElementById('detail-metrics');
const detailFormulaEl = document.getElementById('detail-formula');
const detailSuggestedTargetContainer = document.getElementById('detail-suggested-target-container');
const detailExplanationEl = document.getElementById('detail-explanation');
const detailWorkerVoiceEl = document.getElementById('detail-worker-voice');
const detailAlternativesEl = document.getElementById('detail-alternatives');
const detailActionEl = document.getElementById('detail-action');

// Upload Modal Elements
const uploadModal = document.getElementById('upload-modal');
const uploadCloseBtn = document.getElementById('upload-close-btn');
const uploadCancelBtn = document.getElementById('upload-cancel-btn');
const uploadSubmitBtn = document.getElementById('upload-submit-btn');
const csvFileInput = document.getElementById('csv-file-input');
const csvPasteInput = document.getElementById('csv-paste-input');
const uploadModeSelect = document.getElementById('upload-mode');
const uploadFeedback = document.getElementById('upload-feedback');

/**
 * Show a brief user notification toast
 */
function showToast(message, isError = false) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/**
 * Shared state update: refresh KPI counts, chart, map, worker voice, and findings together
 */
async function refreshAll() {
  await Promise.all([
    loadSummary(),
    loadChart(),
    loadMap(),
    loadWorkerVoice(),
    loadFindings()
  ]);
}

/**
 * Fetch KPI counts and filter dropdown items
 */
async function loadSummary() {
  try {
    const res = await fetch('/api/summary');
    if (!res.ok) throw new Error('Failed to load system summary');
    const data = await res.json();
    state.summary = data;

    // Update KPI cards (Suppressed groups are strictly counted only in suppressedSmallGroups)
    kpiReviewedEl.textContent = data.kpi.groupsReviewed;
    kpiReviewNeededEl.textContent = data.kpi.needingReview;
    kpiUnfairEl.textContent = data.kpi.unfairTargets;
    kpiErrorsEl.textContent = data.kpi.dataErrors;
    kpiSuppressedEl.textContent = data.kpi.suppressedSmallGroups;

    // Populate filter dropdowns dynamically (excluding suppressed groups)
    populateDropdown(filterDistrictEl, data.filters.districts, state.filters.district);
    populateDropdown(filterBlockEl, data.filters.blocks, state.filters.block);
    populateDropdown(filterMonthEl, data.filters.months, state.filters.month);
  } catch (err) {
    console.error('Error loading summary:', err);
    showToast('Failed to load system metrics.', true);
  }
}

/**
 * Helper to populate select dropdowns
 */
function populateDropdown(selectEl, items, currentVal) {
  const current = currentVal || 'All';
  selectEl.innerHTML = '<option value="All">All</option>';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    if (item === current) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

/**
 * Fetch and render District Overview stacked bar chart (Chart.js)
 */
async function loadChart() {
  if (typeof Chart === 'undefined') {
    if (chartSummaryText) chartSummaryText.textContent = 'Chart library loading...';
    return;
  }

  try {
    const params = new URLSearchParams();
    if (state.filters.district !== 'All') params.append('district', state.filters.district);
    if (state.filters.block !== 'All') params.append('block', state.filters.block);
    if (state.filters.month !== 'All') params.append('month', state.filters.month);

    const res = await fetch(`/api/chart-data?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load chart data');
    const data = await res.json();

    // Destroy existing chart to avoid memory leaks or duplicate instances
    if (state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }

    if (!data.labels || data.labels.length === 0) {
      chartCanvas.style.display = 'none';
      chartEmptyState.style.display = 'flex';
      chartSummaryText.textContent = 'No data to display';
      return;
    }

    chartCanvas.style.display = 'block';
    chartEmptyState.style.display = 'none';
    chartSummaryText.textContent = data.summaryText || 'District status breakdown.';

    const ctx = chartCanvas.getContext('2d');
    state.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: data.datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            title: {
              display: true,
              text: 'District',
              color: '#2B2D2F',
              font: { weight: 'bold', size: 12 }
            },
            grid: { display: false }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Groups',
              color: '#2B2D2F',
              font: { weight: 'bold', size: 12 }
            },
            ticks: { precision: 0 }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              padding: 10,
              font: { size: 11, family: 'inherit' }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const index = elements[0].index;
            const clickedDistrict = data.labels[index];
            if (clickedDistrict && state.filters.district !== clickedDistrict) {
              state.filters.district = clickedDistrict;
              filterDistrictEl.value = clickedDistrict;
              showToast(`Filtered to district: ${clickedDistrict}`);
              refreshAll();
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Error loading chart:', err);
    if (chartEmptyState) chartEmptyState.style.display = 'flex';
    if (chartCanvas) chartCanvas.style.display = 'none';
    if (chartSummaryText) chartSummaryText.textContent = 'Failed to load chart metrics.';
  }
}

/**
 * Fetch and render Block Pressure Map (Leaflet)
 */
async function loadMap() {
  if (typeof L === 'undefined') return;

  try {
    const params = new URLSearchParams();
    if (state.filters.district !== 'All') params.append('district', state.filters.district);
    if (state.filters.month !== 'All') params.append('month', state.filters.month);

    const res = await fetch(`/api/map-data?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load map data');
    const data = await res.json();

    // Clean up existing map instance to avoid duplicates
    if (state.mapInstance) {
      state.mapInstance.remove();
      state.mapInstance = null;
    }

    const mapContainer = document.getElementById('pressure-map');
    if (!mapContainer) return;

    state.mapInstance = L.map('pressure-map', {
      scrollWheelZoom: false,
      zoomControl: true
    });

    // OpenStreetMap tile layer with required attribution
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(state.mapInstance);

    const markers = [];

    data.blocks.forEach(b => {
      // Custom accessible divIcon with symbol inside
      const markerHtml = `<div class="map-div-marker marker-${b.color}" title="${escapeHtml(b.block)}: ${escapeHtml(b.label)}">${b.symbol}</div>`;
      const customIcon = L.divIcon({
        className: 'custom-leaflet-icon',
        html: markerHtml,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([b.lat, b.lng], { icon: customIcon });

      // Construct popup content
      let popupContent = `
        <div class="popup-title">${escapeHtml(b.block)}</div>
        <div class="popup-district">${escapeHtml(b.district)}</div>
        <div>
          <span class="popup-status-badge status-${b.status}">${b.symbol} ${escapeHtml(b.label)}</span>
        </div>
      `;

      if (b.isSuppressed) {
        popupContent += `
          <p class="popup-reason" style="color: var(--privacy-text); font-style: italic;">
            <strong>Privacy Protection:</strong> Suppressed (small group), values hidden.
          </p>
        `;
      } else {
        popupContent += `<p class="popup-reason">${escapeHtml(b.reason)}</p>`;
        if (b.counts) {
          popupContent += `
            <div style="font-size: 0.78rem; color: #4B5563; margin-bottom: 0.6rem; background: #F9FAFB; padding: 0.35rem; border-radius: 4px;">
              Eligible: <strong>${b.counts.eligible}</strong> &bull; Reported: <strong>${b.counts.reported}</strong> &bull; Target: <strong>${b.counts.target}</strong>
            </div>
          `;
        }
      }

      // Add "View findings" button to filter table
      popupContent += `
        <button class="popup-btn" onclick="window.filterByBlock('${escapeHtml(b.district)}', '${escapeHtml(b.block)}')">
          View findings &rarr;
        </button>
      `;

      marker.bindPopup(popupContent);
      markers.push(marker);
    });

    state.mapMarkersGroup = L.featureGroup(markers).addTo(state.mapInstance);

    // Auto-fit bounds
    if (markers.length > 0) {
      state.mapInstance.fitBounds(state.mapMarkersGroup.getBounds().pad(0.15));
    } else {
      state.mapInstance.setView([23.7, 77.2], 7);
    }
  } catch (err) {
    console.error('Error loading map:', err);
  }
}

/**
 * Filter by clicked block on map popup
 */
window.filterByBlock = function(district, block) {
  state.filters.district = district;
  state.filters.block = block;
  filterDistrictEl.value = district;
  filterBlockEl.value = block;

  showToast(`Filtered to ${district} &bull; ${block}`);
  refreshAll().then(() => {
    // Scroll smoothly to findings table
    const tableEl = document.querySelector('.table-container');
    if (tableEl) {
      tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
};

/**
 * Global helper: Open simulator with prefilled block and suggested high target
 */
window.tryInSimulator = function(district, block, highTarget) {
  window.location.href = `/simulator.html?block=${encodeURIComponent(block)}&target=${encodeURIComponent(highTarget)}`;
};

/**
 * Fetch and render Worker Voice panel (anonymous, group-level)
 */
async function loadWorkerVoice() {
  const container = document.getElementById('worker-voice-list');
  if (!container) return;

  try {
    const params = new URLSearchParams();
    if (state.filters.district !== 'All') params.append('district', state.filters.district);
    if (state.filters.month !== 'All') params.append('month', state.filters.month);

    const res = await fetch(`/api/worker-voice?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load worker voice data');
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      container.innerHTML = `<div style="grid-column: 1 / -1; font-size: 0.88rem; color: var(--text-muted); font-style: italic; padding: 1rem 0;">No worker feedback recorded for the selected period.</div>`;
      return;
    }

    container.innerHTML = '';
    data.results.forEach(entry => {
      const card = document.createElement('div');
      card.className = `worker-voice-card ${entry.hasEnoughReports ? 'wv-threshold-met' : 'wv-threshold-unmet'}`;

      if (entry.hasEnoughReports) {
        let issuesHtml = '';
        for (const [issueName, count] of Object.entries(entry.issues)) {
          issuesHtml += `
            <div class="worker-voice-issue">
              <span>${escapeHtml(issueName)}</span>
              <span class="worker-voice-count">${count} reports</span>
            </div>
          `;
        }

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div class="worker-voice-title">${escapeHtml(entry.block)}</div>
              <div class="worker-voice-meta">${escapeHtml(entry.district)} &bull; ${escapeHtml(entry.month)}</div>
            </div>
            <span class="badge-tag" style="background: var(--amber-bg); color: var(--amber-text);">${entry.totalReports} submissions</span>
          </div>
          <div style="margin-top: 0.4rem;">
            ${issuesHtml}
          </div>
        `;
      } else {
        card.innerHTML = `
          <div>
            <div class="worker-voice-title">${escapeHtml(entry.block)}</div>
            <div class="worker-voice-meta">${escapeHtml(entry.district)} &bull; ${escapeHtml(entry.month)}</div>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); font-style: italic; margin-top: 0.4rem; padding: 0.4rem; background: #F3F4F6; border-radius: 4px;">
            🔒 Not enough reports to display (&lt; 5 reports)
          </div>
        `;
      }

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading worker voice:', err);
    container.innerHTML = `<div style="grid-column: 1 / -1; font-size: 0.85rem; color: var(--error-text);">Failed to load worker feedback.</div>`;
  }
}

/**
 * Fetch and render findings table live
 */
async function loadFindings() {
  try {
    tableBodyEl.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">Analyzing health reporting records...</td></tr>`;

    const params = new URLSearchParams();
    if (state.filters.district !== 'All') params.append('district', state.filters.district);
    if (state.filters.block !== 'All') params.append('block', state.filters.block);
    if (state.filters.month !== 'All') params.append('month', state.filters.month);
    if (state.filters.status !== 'All') params.append('status', state.filters.status);

    const res = await fetch(`/api/findings?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch findings');
    const data = await res.json();
    state.findings = data.results;

    renderTable(data.results);
    tableCountEl.textContent = `Showing ${data.results.length} group report(s)`;
  } catch (err) {
    console.error('Error fetching findings:', err);
    tableBodyEl.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--error-text);">Failed to load reporting records. Please check the server.</td></tr>`;
    showToast('Error loading records.', true);
  }
}

/**
 * Render findings table with accessible status labels and privacy suppression
 */
function renderTable(items) {
  if (items.length === 0) {
    tableBodyEl.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No reporting groups match the selected filters.</td></tr>`;
    return;
  }

  tableBodyEl.innerHTML = '';

  items.forEach((item) => {
    const { row, statusInfo } = item;
    const isSuppressed = row.isSuppressed;

    const tr = document.createElement('tr');
    tr.className = `row-status-${statusInfo.status}`;
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', `Group ${row.district} ${row.block}, status: ${statusInfo.label}`);

    // Click & Keyboard support
    tr.addEventListener('click', () => openDetails(item));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetails(item);
      }
    });

    // Format numbers or suppression badges
    const formatCell = (val) => {
      if (isSuppressed) {
        return `<span class="suppressed-badge">Suppressed (&lt;30)</span>`;
      }
      return val !== undefined && val !== null ? val : '—';
    };

    // Sessions display
    const sessionsDisplay = isSuppressed 
      ? `<span class="suppressed-badge">Suppressed</span>` 
      : `${row.sessionsHeld !== null ? row.sessionsHeld : '—'} / ${row.sessionsPlanned !== null ? row.sessionsPlanned : '—'}`;

    tr.innerHTML = `
      <td><strong>${escapeHtml(row.district)}</strong></td>
      <td>${escapeHtml(row.block)}</td>
      <td>${escapeHtml(row.month)}</td>
      <td>${escapeHtml(row.indicator || 'General')}</td>
      <td>${formatCell(row.eligible)}</td>
      <td>${formatCell(row.reported)}</td>
      <td>${formatCell(row.target)}</td>
      <td>${formatCell(row.avg)}</td>
      <td>${sessionsDisplay}</td>
      <td>
        <span class="status-badge ${statusInfo.badgeClass}">
          <span aria-hidden="true">${statusInfo.icon}</span> ${statusInfo.label}
        </span>
      </td>
    `;

    tableBodyEl.appendChild(tr);
  });
}

/**
 * Open details slide-out panel for selected row
 */
function openDetails(item) {
  state.selectedRow = item;
  const { row, findings, statusInfo } = item;
  const isSuppressed = row.isSuppressed;

  detailTitleEl.textContent = `${row.district} — ${row.block} (${row.month})`;
  detailStatusEl.className = `status-badge ${statusInfo.badgeClass}`;
  detailStatusEl.innerHTML = `<span aria-hidden="true">${statusInfo.icon}</span> ${statusInfo.label}`;

  // Metrics summary
  if (isSuppressed) {
    detailMetricsEl.innerHTML = `
      <div style="background: var(--privacy-bg); border: 1px solid var(--privacy-border); padding: 0.8rem; border-radius: var(--radius-sm); color: var(--privacy-text);">
        <strong>Privacy Notice:</strong> Demographic counts for this catchment area are suppressed because the eligible population is under 30 individuals. Individual service records cannot be viewed or reverse-engineered.
      </div>
    `;
    detailFormulaEl.textContent = 'Cohort count < 30 individuals (Suppressed to preserve privacy)';
  } else {
    detailMetricsEl.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; font-size: 0.88rem;">
        <div><strong>Eligible Population:</strong> ${row.eligible}</div>
        <div><strong>Reported Delivery:</strong> ${row.reported}</div>
        <div><strong>Allocated Target:</strong> ${row.target}</div>
        <div><strong>Historical 3-Mo Avg:</strong> ${row.avg}</div>
        <div><strong>Sessions Planned:</strong> ${row.sessionsPlanned}</div>
        <div><strong>Sessions Held:</strong> ${row.sessionsHeld}</div>
      </div>
    `;

    // Mathematical formula / gap explanation
    if (findings.length > 0) {
      const formulas = findings.map(f => {
        if (f.rule === 'UNFAIR_TARGET') {
          const gap = (Number(row.target) || 0) - (Number(row.eligible) || 0);
          return `Target (${row.target}) > Eligible Cohort (${row.eligible}) => Impossible System Deficit: +${gap}`;
        } else if (f.rule === 'IMPOSSIBLE_NUMBER') {
          const excess = (Number(row.reported) || 0) - (Number(row.eligible) || 0);
          return `Reported (${row.reported}) > Eligible Cohort (${row.eligible}) => Denominator Exceeded by: +${excess}`;
        } else if (f.rule === 'SPIKE') {
          const diff = (Number(row.reported) || 0) - (Number(row.avg) || 0);
          const pct = Math.round((diff / (Number(row.avg) || 1)) * 100);
          return `Reported (${row.reported}) vs Baseline Avg (${row.avg}) => +${pct}% Surge`;
        } else if (f.rule === 'SESSION_MISMATCH') {
          return `Sessions Held (${row.sessionsHeld}/${row.sessionsPlanned}) < 50% while Reported Volume (${row.reported}) is High`;
        } else if (f.rule === 'INCONCLUSIVE') {
          return `Eligible Population = ${row.eligible} (Division by 0 prevented; cannot calculate rates)`;
        }
        return `${f.rule}: ${f.observed} vs ${f.reference}`;
      });
      detailFormulaEl.textContent = formulas.join('\n');
    } else {
      detailFormulaEl.textContent = `Target (${row.target}) <= Eligible Cohort (${row.eligible}) => Target is within eligible demographic baseline.`;
    }
  }

  // Suggested Fair Target Section (specifically for unfair-target findings)
  const hasUnfairTarget = findings.some(f => f.rule === 'UNFAIR_TARGET');
  if (hasUnfairTarget && item.suggestedFairTarget && item.suggestedFairTarget.status === 'ok') {
    detailSuggestedTargetContainer.innerHTML = `
      <section class="detail-section" style="border: 2px solid var(--primary); background: #E8F3EE; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
          <h4 style="color: var(--primary); margin: 0; font-size: 0.85rem; font-weight: 700;">Suggested Fair Target Range</h4>
          <span style="font-size: 1.15rem; font-weight: 800; color: var(--primary); font-family: var(--font-mono);">${item.suggestedFairTarget.low} &ndash; ${item.suggestedFairTarget.high}</span>
        </div>
        <p style="font-size: 0.82rem; color: var(--primary); font-style: italic; margin-bottom: 0.65rem;">
          A starting point for review, not an order. Check sessions, staff and local context.
        </p>
        <button class="btn btn-primary" style="font-size: 0.82rem; padding: 0.4rem 0.8rem; width: 100%;" onclick="window.tryInSimulator('${escapeHtml(row.district)}', '${escapeHtml(row.block)}', ${item.suggestedFairTarget.high})">
          Try in simulator &rarr;
        </button>
      </section>
    `;
  } else {
    detailSuggestedTargetContainer.innerHTML = '';
  }

  // Findings details (System Explanation, Alternatives, Action)
  if (findings.length > 0) {
    const primaryFinding = findings[0];
    detailExplanationEl.textContent = primaryFinding.explanation;

    detailAlternativesEl.innerHTML = '';
    (primaryFinding.alternativeExplanations || []).forEach(alt => {
      const li = document.createElement('li');
      li.textContent = alt;
      detailAlternativesEl.appendChild(li);
    });

    detailActionEl.textContent = primaryFinding.recommendedAction;
  } else {
    detailExplanationEl.textContent = 'This reporting group exhibits balanced volume metrics within expected demographic boundaries.';
    detailAlternativesEl.innerHTML = '<li>Routine service delivery schedule maintained effectively.</li>';
    detailActionEl.textContent = 'Maintain current supportive supervision and supply allocation.';
  }

  // Worker Voice context in details (only when threshold is met)
  if (item.workerVoice && item.workerVoice.issues && Object.keys(item.workerVoice.issues).length > 0) {
    const issueStrs = Object.entries(item.workerVoice.issues).map(([name, count]) => `${escapeHtml(name)} (${count} reports)`);
    detailWorkerVoiceEl.innerHTML = `
      <div style="background: #FFFBEB; border-left: 4px solid var(--amber-text); padding: 0.55rem 0.8rem; border-radius: 0 4px 4px 0; margin-top: 0.6rem; font-size: 0.85rem; color: #92400E;">
        <strong>Workers in this block also reported:</strong> ${issueStrs.join(', ')}
      </div>
    `;
  } else {
    detailWorkerVoiceEl.innerHTML = '';
  }

  // Open drawer
  detailsBackdrop.style.display = 'block';
  detailsPanel.classList.add('open');
}

/**
 * Close details panel
 */
function closeDetails() {
  detailsPanel.classList.remove('open');
  detailsBackdrop.style.display = 'none';
  state.selectedRow = null;
}

/**
 * Restore Synthetic Demo Data
 */
async function resetDemoData() {
  if (!confirm('Restore synthetic demo data? This will reset all records to the original demonstration dataset.')) {
    return;
  }

  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reset failed');

    showToast('Synthetic demo data restored successfully.');
    state.filters = { district: 'All', block: 'All', month: 'All', status: 'All' };
    filterDistrictEl.value = 'All';
    filterBlockEl.value = 'All';
    filterMonthEl.value = 'All';
    filterStatusEl.value = 'All';
    await refreshAll();
  } catch (err) {
    console.error('Error resetting demo data:', err);
    showToast('Failed to reset demo data.', true);
  }
}

/**
 * Handle CSV Upload Submission
 */
async function submitCsvUpload() {
  uploadFeedback.innerHTML = '';
  let csvText = '';

  const file = csvFileInput.files[0];
  if (file) {
    csvText = await file.text();
  } else if (csvPasteInput.value.trim()) {
    csvText = csvPasteInput.value.trim();
  } else {
    uploadFeedback.innerHTML = `<div style="color: var(--error-text);">Please choose a CSV file or paste CSV text.</div>`;
    return;
  }

  uploadSubmitBtn.disabled = true;
  uploadSubmitBtn.textContent = 'Processing...';

  try {
    const mode = uploadModeSelect.value;
    const res = await fetch(`/api/upload?mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    let feedbackHtml = `
      <div style="background: var(--ok-bg); color: var(--ok-text); padding: 0.8rem; border-radius: var(--radius-sm); font-size: 0.88rem;">
        <strong>Upload Finished:</strong> Accepted ${data.acceptedCount} rows. Rejected ${data.rejectedCount} rows.
      </div>
    `;

    if (data.rejectedCount > 0) {
      feedbackHtml += `
        <div style="margin-top: 0.8rem; max-height: 150px; overflow-y: auto; font-size: 0.82rem; background: var(--bg-warm); padding: 0.6rem; border: 1px solid var(--border);">
          <strong>Rejected Row Details:</strong>
          <ul style="padding-left: 1rem; margin-top: 0.3rem;">
            ${data.rejected.map(r => `<li><strong>Row ${r.rowNumber}:</strong> ${escapeHtml(r.reason)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    uploadFeedback.innerHTML = feedbackHtml;
    showToast(`Processed CSV: ${data.acceptedCount} accepted, ${data.rejectedCount} rejected.`);

    // Refresh UI
    await refreshAll();

    if (data.rejectedCount === 0) {
      setTimeout(() => {
        closeUploadModal();
      }, 1800);
    }
  } catch (err) {
    console.error('Error uploading CSV:', err);
    uploadFeedback.innerHTML = `<div style="color: var(--error-text); font-size: 0.88rem;">${escapeHtml(err.message)}</div>`;
  } finally {
    uploadSubmitBtn.disabled = false;
    uploadSubmitBtn.textContent = 'Process & Save';
  }
}

function openUploadModal() {
  uploadModal.style.display = 'flex';
  uploadFeedback.innerHTML = '';
  csvFileInput.value = '';
  csvPasteInput.value = '';
}

function closeUploadModal() {
  uploadModal.style.display = 'none';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  const session = await initAuth('admin');
  if (!session) return;

  refreshAll();

  // Filters change listener
  filterDistrictEl.addEventListener('change', (e) => {
    state.filters.district = e.target.value;
    refreshAll();
  });
  filterBlockEl.addEventListener('change', (e) => {
    state.filters.block = e.target.value;
    refreshAll();
  });
  filterMonthEl.addEventListener('change', (e) => {
    state.filters.month = e.target.value;
    refreshAll();
  });
  filterStatusEl.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    loadFindings(); // Status only applies to table view
  });

  filterResetBtn.addEventListener('click', () => {
    state.filters = { district: 'All', block: 'All', month: 'All', status: 'All' };
    filterDistrictEl.value = 'All';
    filterBlockEl.value = 'All';
    filterMonthEl.value = 'All';
    filterStatusEl.value = 'All';
    refreshAll();
  });

  // Action Buttons
  btnLoadDemo.addEventListener('click', resetDemoData);
  btnUploadCsv.addEventListener('click', openUploadModal);
  btnExportCsv.addEventListener('click', () => {
    window.location.href = '/api/export';
  });

  // Details Panel Controls
  detailsCloseBtn.addEventListener('click', closeDetails);
  detailsBackdrop.addEventListener('click', closeDetails);

  // Upload Modal Controls
  uploadCloseBtn.addEventListener('click', closeUploadModal);
  uploadCancelBtn.addEventListener('click', closeUploadModal);
  uploadSubmitBtn.addEventListener('click', submitCsvUpload);
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeUploadModal();
  });

  // Escape key to close drawers
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetails();
      closeUploadModal();
    }
  });
});
