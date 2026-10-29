/**
 * auth.js
 * 
 * Shared role-based demo access and navigation manager for Pressure Map.
 * Principle: "Strengthen the system; protect the people in it."
 */

async function initAuth(requiredRole = null) {
  try {
    const res = await fetch('/api/me');
    
    // Not authenticated
    if (!res.ok) {
      if (requiredRole) {
        window.location.href = '/login.html';
        return null;
      }
      renderNav(null);
      return null;
    }

    const session = await res.json();

    // Role mismatch
    if (requiredRole && session.role !== requiredRole) {
      if (session.role === 'admin') {
        window.location.href = '/index.html';
      } else if (session.role === 'worker') {
        window.location.href = '/worker.html';
      } else {
        window.location.href = '/login.html';
      }
      return null;
    }

    // Render navigation according to role
    renderNav(session);
    return session;

  } catch (err) {
    console.error('Auth verification error:', err);
    if (requiredRole) {
      window.location.href = '/login.html';
    }
    return null;
  }
}

/**
 * Render role-specific navigation links, role badge, and logout button
 */
function renderNav(session) {
  const navEl = document.querySelector('nav.site-nav');
  if (!navEl) return;

  const currentPath = window.location.pathname;

  let linksHtml = '';

  if (!session) {
    // Public / unauthenticated state
    linksHtml = `
      <a href="/responsible-use.html" class="nav-link ${currentPath.includes('responsible-use') ? 'active' : ''}">Responsible Use</a>
      <a href="/login.html" class="nav-link ${currentPath.includes('login') ? 'active' : ''}">Login</a>
    `;
  } else if (session.role === 'admin') {
    // Admin / Supervisor role
    linksHtml = `
      <a href="/index.html" class="nav-link ${currentPath === '/' || currentPath.includes('index') ? 'active' : ''}">Admin Pressure Map</a>
      <a href="/simulator.html" class="nav-link ${currentPath.includes('simulator') ? 'active' : ''}">Target Simulator</a>
      <a href="/responsible-use.html" class="nav-link ${currentPath.includes('responsible-use') ? 'active' : ''}">Responsible Use</a>
      <div class="auth-nav-meta">
        <span class="role-badge-nav" title="Logged in with supervisory privileges">
          <span aria-hidden="true">🛡️</span> Admin
        </span>
        <button type="button" class="btn-nav-logout" onclick="logoutUser()">Log Out</button>
      </div>
    `;
  } else if (session.role === 'worker') {
    // Worker role
    const blockLabel = session.block ? escapeHtml(session.block) : 'Catchment Worker';
    linksHtml = `
      <a href="/worker.html" class="nav-link ${currentPath.includes('worker') ? 'active' : ''}">Worker Report Form</a>
      <a href="/responsible-use.html" class="nav-link ${currentPath.includes('responsible-use') ? 'active' : ''}">Responsible Use</a>
      <div class="auth-nav-meta">
        <span class="role-badge-nav" title="Authenticated via shared block access code">
          <span aria-hidden="true">🩺</span> ${blockLabel}
        </span>
        <button type="button" class="btn-nav-logout" onclick="logoutUser()">Log Out</button>
      </div>
    `;
  }

  navEl.innerHTML = linksHtml;
}

/**
 * Handle user logout
 */
async function logoutUser() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    window.location.href = '/login.html';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
