/* gsl5.js — GSL5 控制台 (WebShell 管理增强) */
(function () {
  'use strict';

  // ---------- 样式注入 ----------
  function injectStyle() {
    if (document.getElementById('gsl5-style')) return;
    var css = `
      .gsl5-conn-badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600}
      .gsl5-conn-badge.gsl5-ok{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.4)}
      .gsl5-conn-badge.gsl5-bad{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.4)}
      .gsl5-tabs{display:flex;gap:6px;border-bottom:1px solid var(--border,#2a3644);padding-bottom:8px;margin-bottom:14px}
      .gsl5-tab{background:none;border:1px solid transparent;color:var(--muted,#8b98a9);padding:7px 16px;border-radius:8px;cursor:pointer;font-size:13px}
      .gsl5-tab:hover{background:rgba(77,163,255,.08);color:var(--text,#d5dee8)}
      .gsl5-tab--active{background:rgba(77,163,255,.15);color:var(--primary,#4da3ff);border-color:rgba(77,163,255,.3)}
      .gsl5-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
      .gsl5-shell-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
      .gsl5-shell-card{background:var(--card-bg,#1b2430);border:1px solid var(--border,#2a3644);border-radius:10px;padding:12px 14px;cursor:pointer;transition:border-color .15s}
      .gsl5-shell-card:hover{border-color:var(--primary,#4da3ff)}
      .gsl5-shell-card.gsl5-sel{border-color:var(--primary,#4da3ff);background:rgba(77,163,255,.07)}
      .gsl5-shell-url{font-size:13px;font-weight:600;color:var(--text,#d5dee8);word-break:break-all}
      .gsl5-shell-meta{font-size:12px;color:var(--muted,#8b98a9);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap}
      .gsl5-shell-id{font-size:11px;color:var(--muted,#8b98a9);margin-top:6px;font-family:monospace;word-break:break-all}
      .gsl5-exec-box{display:flex;flex-direction:column;gap:8px}
      .gsl5-exec-output{background:#0d1420;border:1px solid var(--border,#2a3644);border-radius:8px;padding:12px;min-height:320px;max-height:520px;overflow:auto;font-family:Consolas,Menlo,monospace;font-size:12.5px;color:#c8d6e5;white-space:pre-wrap;word-break:break-all;line-height:1.55}
      .gsl5-exec-input-row{display:flex;gap:8px}
      .gsl5-exec-input-row input{flex:1}
      .gsl5-create-form{display:flex;flex-direction:column;gap:10px;max-width:560px}
      .gsl5-create-row{display:flex;align-items:center;gap:10px}
      .gsl5-create-row label{min-width:80px;font-size:13px;color:var(--muted,#8b98a9)}
      .gsl5-create-row input,.gsl5-create-row select{flex:1}
      .gsl5-os-group{margin-bottom:12px}
      .gsl5-os-group-title{font-size:13px;font-weight:700;color:var(--text,#d5dee8);margin-bottom:8px;padding:6px 10px;background:rgba(77,163,255,.08);border-radius:6px}
      .gsl5-os-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
      .gsl5-os-badge.gsl5-os-win{background:rgba(77,163,255,.15);color:#4da3ff}
      .gsl5-os-badge.gsl5-os-linux{background:rgba(240,178,60,.15);color:#f0b23c}
      .gsl5-os-badge.gsl5-os-unk{background:rgba(139,152,169,.15);color:#8b98a9}
      .gsl5-quick-path{padding:3px 10px;font-size:12px;margin-right:6px;margin-bottom:4px}
      #gsl5-file-osbar{display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:10px;padding:8px 10px;background:rgba(77,163,255,.05);border:1px solid var(--border,#2a3644);border-radius:8px}
    `;
    var st = document.createElement('style');
    st.id = 'gsl5-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- 状态 ----------
  var curShellId = '';
  var shells = [];
  var osProbing = {}; // id -> true (探测中)
  var osCache = {};   // id -> 'win' | 'linux' | 'unknown'
  var QUICK_PATHS = {
    win:   ['C:\\', 'C:\\Windows\\Temp', 'C:\\inetpub\\wwwroot', 'C:\\phpstudy_pro\\WWW', 'C:\\xampp\\htdocs'],
    linux: ['/', '/tmp', '/var/www/html', '/var/www', '/home', '/root']
  };
  function osBadgeHtml(os) {
    if (os === 'win')  return '<span class=\"gsl5-os-badge gsl5-os-win\">🪟 Windows</span>';
    if (os === 'linux') return '<span class=\"gsl5-os-badge gsl5-os-linux\">🐧 Linux</span>';
    return '<span class=\"gsl5-os-badge gsl5-os-unk\">❓ 未知</span>';
  }
  function osDefaultPath(os) { return os === 'win' ? 'C:\\' : '/'; }

  function api(path, opts) {
    return apiFetch(path, opts || {});
  }

  // ---------- 状态徽标 ----------
  window.gsl5RefreshStatus = function () {
    var badge = document.getElementById('gsl5-conn-badge');
    if (!badge) return;
    badge.textContent = '查询中…';
    badge.className = 'gsl5-conn-badge';
    api('/api/gsl5/status').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.status === 'connected') {
        badge.textContent = 'GSL5 已连接 · ' + (d.tool_count || 0) + ' 工具';
        badge.className = 'gsl5-conn-badge gsl5-ok';
      } else {
        badge.textContent = 'GSL5 未连接';
        badge.className = 'gsl5-conn-badge gsl5-bad';
      }
    }).catch(function () {
      badge.textContent = 'GSL5 状态未知';
      badge.className = 'gsl5-conn-badge gsl5-bad';
    });
  };

  // ---------- Tab 切换 ----------
  window.gsl5SwitchTab = function (tab) {
    document.querySelectorAll('.gsl5-tab').forEach(function (t) {
      t.classList.toggle('gsl5-tab--active', t.getAttribute('data-gsl5-tab') === tab);
    });
    ['shells', 'exec', 'files', 'create'].forEach(function (t) {
      var el = document.getElementById('gsl5-panel-' + t);
      if (el) el.style.display = (t === tab) ? '' : 'none';
    });
    if (tab === 'shells') window.gsl5LoadShells();
    if (tab === 'exec') window.gsl5SyncShellSelects();
    if (tab === 'files') { window.gsl5SyncShellSelects(); window.gsl5SyncFileOsBar(); }
  };

  // ---------- Shell 列表 ----------
  window.gsl5LoadShells = function () {
    var listEl = document.getElementById('gsl5-shell-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="supply-empty">加载中…</div>';
    api('/api/gsl5/shells').then(function (r) { return r.json(); }).then(function (d) {
      var text = (d && d.content) || '';
      shells = [];
      var lines = text.split('\n').filter(function (l) { return l.trim(); });
      if (!lines.length) {
        listEl.innerHTML = '<div class="supply-empty">暂无 WebShell, 切到「Shell 生成」或到 GSL5 添加</div>';
        return;
      }
      var cards = lines.map(function (line) {
        // 格式: id | url | encoding+proxy
        var parts = line.split('|').map(function (s) { return s.trim(); });
        var id = parts[0] || '';
        var url = parts[1] || '';
        var enc = parts[2] || '';
        var obj = { id: id, url: url, enc: enc, os: osCache[id] || '' };
        shells.push(obj);
        return '<div class="gsl5-shell-card' + (id === curShellId ? ' gsl5-sel' : '') + '" onclick="gsl5SelectShell(\'' + id + '\', this)">' +
          '<div class="gsl5-shell-url">' + esc(url || id) + '</div>' +
          '<div class="gsl5-shell-meta">' + osBadgeHtml(obj.os) + '<span>' + esc(enc || '未知编码') + '</span></div>' +
          '<div class="gsl5-shell-id">' + esc(id) + '</div>' +
          '</div>';
      }).join('');
      // 按 OS 分组: Windows / Linux / 未知(检测中)
      function groupCards() {
        var gWin = [], gLin = [], gUnk = [];
        shells.forEach(function (s) {
          if (s.os === 'win') gWin.push(s);
          else if (s.os === 'linux') gLin.push(s);
          else gUnk.push(s);
        });
        function renderGroup(title, list) {
          if (!list.length) return '';
          return '<div class="gsl5-os-group"><div class="gsl5-os-group-title">' + title + ' (' + list.length + ')</div>' +
            '<div class="gsl5-shell-list">' + list.map(function (s) {
              return '<div class="gsl5-shell-card' + (s.id === curShellId ? ' gsl5-sel' : '') + '" onclick="gsl5SelectShell(\'' + s.id + '\', this)">' +
                '<div class="gsl5-shell-url">' + esc(s.url || s.id) + '</div>' +
                '<div class="gsl5-shell-meta">' + osBadgeHtml(s.os) + '<span>' + esc(s.enc || '未知编码') + '</span></div>' +
                '<div class="gsl5-shell-id">' + esc(s.id) + '</div>' +
                '</div>';
            }).join('') + '</div></div>';
        }
        return renderGroup('🪟 Windows', gWin) + renderGroup('🐧 Linux', gLin) + renderGroup('❓ 未识别', gUnk);
      }
      listEl.innerHTML = '<div class="gsl5-os-group-wrap">' + groupCards() + '</div>';
      // 批量探测系统类型(shell_info)
      shells.forEach(function (s) {
        if (!s.os && !osProbing[s.id]) window.gsl5ProbeOs(s.id);
      });
    }).catch(function (e) {
      listEl.innerHTML = '<div class="supply-empty">加载失败: ' + esc(e.message || e) + '</div>';
    });
  };

  // ---------- 选择 Shell ----------
  window.gsl5SelectShell = function (id, el) {
    curShellId = id;
    document.querySelectorAll('.gsl5-shell-card').forEach(function (c) { c.classList.remove('gsl5-sel'); });
    if (el) el.classList.add('gsl5-sel');
    window.gsl5SyncShellSelects();
    window.gsl5SyncFileOsBar();
    // 未探测则触发
    if (!osCache[id] && !osProbing[id]) window.gsl5ProbeOs(id);
  };

  // ---------- OS 探测(按 shell_info 内容识别 Windows/Linux) ----------
  window.gsl5ProbeOs = function (id) {
    if (osProbing[id]) return;
    osProbing[id] = true;
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_info', args: { shellId: id } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      var txt = ((d && d.content) || '').toLowerCase();
      var os = 'unknown';
      if (/windows|win32|microsoft|nt kernel|cmd\.exe/i.test(txt)) os = 'win';
      else if (/linux|ubuntu|centos|debian|kali|unix|darwin|\/bin\/sh/i.test(txt)) os = 'linux';
      osCache[id] = os;
      // 更新卡片徽标(未分组视图)与分组
      shells.forEach(function (s) { if (s.id === id) s.os = os; });
      window.gsl5LoadShells();
      window.gsl5SyncShellSelects();
    }).catch(function () {
      osCache[id] = 'unknown';
    }).then(function () { osProbing[id] = false; });
  };

  // ---------- 快速路径(按 OS 分类) ----------
  window.gsl5QuickPath = function (p) {
    var pathEl = document.getElementById('gsl5-file-path');
    if (pathEl) pathEl.value = p;
    window.gsl5FileList();
  };

  // ---------- 文件面板: 显示当前 Shell 的 OS 与快速路径 ----------
  window.gsl5SyncFileOsBar = function () {
    var bar = document.getElementById('gsl5-file-osbar');
    if (!bar) return;
    var id = currentShellId();
    var os = (osCache[id] || '');
    var html = '<span style="margin-right:10px;">' + osBadgeHtml(os || 'unknown') + '</span>';
    var paths = QUICK_PATHS[os === 'win' ? 'win' : 'linux'];
    if (os === 'win' || os === 'linux') {
      html += paths.map(function (p) {
        return '<button type="button" class="btn-secondary gsl5-quick-path" onclick="gsl5QuickPath(\'' + p.replace(/\\/g, '\\\\') + '\')">' + esc(p) + '</button>';
      }).join('');
    } else {
      html += '<span style="font-size:12px;color:var(--muted,#8b98a9);">选择 Shell 后自动识别系统类型, 文件管理按 Windows/Linux 分类</span>';
    }
    bar.innerHTML = html;
    // 默认路径适配
    var pathEl = document.getElementById('gsl5-file-path');
    if (pathEl && (os === 'win' || os === 'linux')) {
      var cur = pathEl.value || '';
      if (cur === '' || cur === '/') pathEl.value = osDefaultPath(os);
    }
  };

  window.gsl5SyncShellSelects = function () {
    var opts = '<option value="">— 选择 Shell —</option>' + shells.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === curShellId ? ' selected' : '') + '>' + esc(s.url) + '</option>';
    }).join('');
    ['gsl5-exec-shell', 'gsl5-file-shell'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  };

  function currentShellId() {
    var el = document.getElementById('gsl5-exec-shell');
    if (el && el.value) return el.value;
    return curShellId;
  }

  // ---------- 命令执行 ----------
  window.gsl5ExecCmd = function () {
    var id = currentShellId();
    var cmdEl = document.getElementById('gsl5-exec-cmd');
    var out = document.getElementById('gsl5-exec-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    var cmd = cmdEl ? cmdEl.value : '';
    if (!cmd.trim()) return;
    out.textContent = '$ ' + cmd + '\n执行中…';
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_exec', args: { shellId: id, command: cmd, encoding: 'auto' } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.error) { out.textContent = '错误: ' + d.error; return; }
      out.textContent = '$ ' + cmd + '\n' + (d.content || '(无输出)');
    }).catch(function (e) {
      out.textContent = '调用失败: ' + esc(e.message || e);
    });
  };

  window.gsl5ExecInfo = function () {
    var id = currentShellId();
    var out = document.getElementById('gsl5-exec-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    out.textContent = '获取系统信息中…';
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_info', args: { shellId: id } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      out.textContent = d.error ? ('错误: ' + d.error) : (d.content || '(无返回)');
    }).catch(function (e) {
      out.textContent = '调用失败: ' + esc(e.message || e);
    });
  };

  window.gsl5ExecTest = function () {
    var id = currentShellId();
    var out = document.getElementById('gsl5-exec-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    out.textContent = '测试连接中…';
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_test', args: { shellId: id } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      out.textContent = d.error ? ('错误: ' + d.error) : (d.content || '(无返回)');
    }).catch(function (e) {
      out.textContent = '调用失败: ' + esc(e.message || e);
    });
  };

  // ---------- 文件管理 ----------
  window.gsl5FileList = function () {
    var el = document.getElementById('gsl5-file-shell');
    var id = el ? el.value : '';
    var pathEl = document.getElementById('gsl5-file-path');
    var path = pathEl ? pathEl.value : '/';
    var out = document.getElementById('gsl5-file-output');
    if (!id) { out.textContent = '请先选择 Shell'; return; }
    out.textContent = '列目录 ' + path + ' …';
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'file_list', args: { shellId: id, path: path } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      out.textContent = d.error ? ('错误: ' + d.error) : (d.content || '(空目录)');
    }).catch(function (e) {
      out.textContent = '调用失败: ' + esc(e.message || e);
    });
  };

  // ---------- Shell 生成 ----------
  window.gsl5CreateShell = function () {
    var url = document.getElementById('gsl5-create-url').value.trim();
    var pass = document.getElementById('gsl5-create-pass').value.trim();
    var key = document.getElementById('gsl5-create-key').value.trim();
    var payload = document.getElementById('gsl5-create-payload').value;
    var cryption = document.getElementById('gsl5-create-cryption').value;
    var out = document.getElementById('gsl5-create-output');
    if (!url || !pass) { out.textContent = 'URL 和密码必填'; return; }
    out.textContent = '生成中…';
    var args = { url: url, password: pass, secretKey: key, payload: payload, cryption: cryption, genFile: 'auto' };
    api('/api/gsl5/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'shell_create', args: args })
    }).then(function (r) { return r.json(); }).then(function (d) {
      out.textContent = d.error ? ('错误: ' + d.error) : (d.content || '(完成)');
    }).catch(function (e) {
      out.textContent = '调用失败: ' + esc(e.message || e);
    });
  };

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ---------- 页面初始化 ----------
  window.gsl5Init = function () {
    injectStyle();
    window.gsl5RefreshStatus();
    window.gsl5LoadShells();
    window.gsl5SyncShellSelects();
    window.gsl5SyncFileOsBar();
  };

  // 兼容 router 的 init 调用约定
  window.gsl5PageInit = window.gsl5Init;
})();
