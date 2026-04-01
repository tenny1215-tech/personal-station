/* ===== NAVIGATION ===== */
const navItems = document.querySelectorAll('.nav-item[data-panel]');
const panels   = document.querySelectorAll('.panel');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.dataset.panel;

    // switch active nav
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    // switch active panel
    panels.forEach(p => p.classList.remove('active'));
    const targetPanel = document.getElementById('p-' + target);
    if (targetPanel) targetPanel.classList.add('active');

    // animate skill bars when skills panel opens
    if (target === 'skills') animateSkillBars();
  });
});

/* ===== CLOCK ===== */
function updateClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  el.textContent = h + ':' + m + ':' + s;
}
updateClock();
setInterval(updateClock, 1000);

/* ===== TYPEWRITER (home name) ===== */
function typeWriter(el, text, speed) {
  let i = 0;
  el.textContent = '';
  function tick() {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      setTimeout(tick, speed);
    }
  }
  tick();
}

const nameEl = document.getElementById('typed-name');
if (nameEl) {
  // Change "Kevin Zhang" to your own name here
  typeWriter(nameEl, 'Kevin Zhang', 80);
}

/* ===== SKILL BARS ===== */
function animateSkillBars() {
  const bars = document.querySelectorAll('.skill-bar');
  bars.forEach(bar => {
    const w = bar.dataset.width || 0;
    // reset then animate
    bar.style.width = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.width = w + '%';
      });
    });
  });
}

/* ===== TERMINAL INPUT ===== */
const termInput  = document.getElementById('termInput');
const termOutput = document.getElementById('term-output');

const commands = {
  help: `available commands:<br>
  &nbsp; about    — show info about me<br>
  &nbsp; projects — list my projects<br>
  &nbsp; skills   — show my skill set<br>
  &nbsp; contact  — contact info<br>
  &nbsp; clear    — clear this output<br>
  &nbsp; whoami   — who are you talking to`,

  about:    'navigating to about.md...',
  projects: 'navigating to projects/...',
  skills:   'navigating to skills.json...',
  contact:  'you are already here!',

  whoami: 'kevin zhang — full-stack engineer &amp; creative developer.',

  clear: '__clear__',

  ls: 'about.md &nbsp; projects/ &nbsp; skills.json &nbsp; contact.sh',

  pwd: '/home/kevin/portfolio',

  date: () => new Date().toString(),

  echo: (args) => args.join(' ') || '&nbsp;',
};

if (termInput) {
  termInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;

    const raw   = termInput.value.trim();
    const parts = raw.split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    const args  = parts.slice(1);

    termInput.value = '';
    if (!raw) return;

    // display entered command
    const cmdLine = document.createElement('div');
    cmdLine.innerHTML = `<span style="color:#3a8a4a">~/portfolio $</span> <span style="color:#00e5ff">${escapeHtml(raw)}</span>`;
    termOutput.appendChild(cmdLine);

    // process command
    let response = '';

    if (cmd in commands) {
      const val = commands[cmd];
      if (val === '__clear__') {
        termOutput.innerHTML = '';
        return;
      } else if (typeof val === 'function') {
        response = val(args);
      } else {
        response = val;
        // navigate panels for certain commands
        const panelMap = { about: 'about', projects: 'projects', skills: 'skills' };
        if (panelMap[cmd]) {
          setTimeout(() => {
            const targetNav = document.querySelector(`[data-panel="${panelMap[cmd]}"]`);
            if (targetNav) targetNav.click();
          }, 400);
        }
      }
    } else {
      response = `command not found: <span style="color:#ff5f57">${escapeHtml(cmd)}</span>. type <span style="color:#00e5ff">help</span> for available commands.`;
    }

    const respLine = document.createElement('div');
    respLine.style.color = '#4a7a54';
    respLine.style.marginBottom = '6px';
    respLine.innerHTML = response;
    termOutput.appendChild(respLine);

    // scroll to bottom
    termOutput.scrollTop = termOutput.scrollHeight;
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ===== INIT ===== */
// Pre-animate skill bars if skills panel is somehow default
if (document.querySelector('#p-skills.active')) {
  animateSkillBars();
}
