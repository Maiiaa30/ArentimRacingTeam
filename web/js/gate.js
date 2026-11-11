// gate.js — SOFT shared-passcode lock for the pit wall.
//
// Set window.RACE_CONFIG.access_passcode to a shared word to require it on load.
// Empty string = no gate.
//
// THIS IS NOT REAL SECURITY. The passcode lives in client JS, so anyone who views
// source can read it. It's a convenience lock so a stray visitor to your race URL
// doesn't land straight on the pit wall. For real protection:
//   * writes are already gated server-side by the Supabase passcode (db/schema.sql)
//   * put the site behind host auth (Netlify password / Cloudflare Access) when you
//     pick hosting — that actually keeps readers out.
//
// Unlock is remembered for the browser session (sessionStorage), not stored as plaintext.
(function () {
  var pass = (window.RACE_CONFIG && window.RACE_CONFIG.access_passcode) || "";
  if (!pass) return;                       // no gate configured

  var KEY = 'arentim_gate_ok';
  function token(p) {                      // tiny non-crypto hash — avoids storing plaintext
    var h = 0;
    for (var i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0;
    return 'g' + (h >>> 0);
  }
  var want = token(pass);
  try { if (sessionStorage.getItem(KEY) === want) return; } catch (e) {}

  var ov = document.createElement('div');
  ov.id = 'gateOverlay';
  ov.setAttribute('style',
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
    'background:#05080c;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif');
  ov.innerHTML =
    '<form id="gateForm" style="width:min(340px,88vw);text-align:center;padding:30px 26px;' +
      'background:linear-gradient(180deg,#111820,#0b1016);border:1px solid #243041;border-radius:14px">' +
      '<div style="font-family:ui-monospace,Menlo,monospace;letter-spacing:3px;font-size:11px;' +
        'color:#7a8aa0;text-transform:uppercase;margin-bottom:6px">Arentim Racing Team</div>' +
      '<div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:18px">Pit Wall — Access</div>' +
      '<input id="gateInput" type="password" autocomplete="off" autofocus placeholder="passcode" ' +
        'style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:9px;border:1px solid #2b3a4d;' +
        'background:#0a1016;color:#fff;font-size:15px;outline:none;text-align:center">' +
      '<div id="gateErr" style="height:16px;margin-top:8px;color:#ff5a4d;font-size:12px"></div>' +
      '<button type="submit" style="margin-top:6px;width:100%;padding:12px;border:0;border-radius:9px;' +
        'background:#e10600;color:#fff;font-weight:700;font-size:15px;cursor:pointer">Enter</button>' +
    '</form>';

  function mount() {
    document.body.appendChild(ov);
    var form = document.getElementById('gateForm');
    var input = document.getElementById('gateInput');
    var err = document.getElementById('gateErr');
    input.focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (input.value === pass) {
        try { sessionStorage.setItem(KEY, want); } catch (e2) {}
        ov.remove();
      } else {
        err.textContent = 'Wrong passcode';
        input.value = '';
        input.focus();
        form.animate(
          [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 160, iterations: 2 });
      }
    });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
